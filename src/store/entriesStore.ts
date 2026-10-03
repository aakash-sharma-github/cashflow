// src/store/entriesStore.ts  (offline-first version)
import { create } from "zustand";
import type { Entry, EntryFormData, EntryFilter } from "../types";
import { entriesService } from "../services/entriesService";
import { localEntriesDb } from "../services/localDb";
import { useOfflineStore } from "./offlineStore";
import { useAuthStore } from "./authStore";
import { useBooksStore } from "./booksStore";
import { PAGE_SIZE } from "../constants";
import { logger } from "../utils/logger";
import { normalizeEntryAmount, subtractMoney, sumMoney } from "../utils/money";

const genTempId = () =>
  `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;

interface EntriesState {
  entries: Entry[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  filter: EntryFilter;
  currentPage: number;
  hasMore: boolean;
  summary: {
    balance: string;
    cash_in: string;
    cash_out: string;
    entry_count: number;
  } | null;
  loadedBookId: string | null;

  fetchEntries: (bookId: string, reset?: boolean) => Promise<void>;
  loadMore: (bookId: string) => Promise<void>;
  createEntry: (
    bookId: string,
    formData: EntryFormData,
  ) => Promise<{ error: string | null }>;
  updateEntry: (
    id: string,
    formData: Partial<EntryFormData>,
    bookId: string,
  ) => Promise<{ error: string | null }>;
  deleteEntry: (
    id: string,
    bookId: string,
  ) => Promise<{ error: string | null }>;
  setFilter: (filter: EntryFilter, bookId: string) => void;
  addEntryFromRealtime: (entry: Entry) => void;
  updateEntryFromRealtime: (entry: Entry) => void;
  removeEntryFromRealtime: (id: string) => void;
  reset: () => void;
}

function computeSummary(entries: Entry[]) {
  const cash_in = sumMoney(entries.filter((e) => e.type === "cash_in").map((e) => e.amount));
  const cash_out = sumMoney(entries.filter((e) => e.type === "cash_out").map((e) => e.amount));
  return {
    cash_in,
    cash_out,
    balance: subtractMoney(cash_in, cash_out),
    entry_count: entries.length,
  };
}

function summaryAfterChange(
  summary: EntriesState['summary'],
  entries: Entry[],
  oldEntry?: Entry,
  newEntry?: Entry,
) {
  const base = summary ?? computeSummary(entries)
  let cash_in = base.cash_in
  let cash_out = base.cash_out
  if (oldEntry?.type === 'cash_in') cash_in = subtractMoney(cash_in, oldEntry.amount)
  if (oldEntry?.type === 'cash_out') cash_out = subtractMoney(cash_out, oldEntry.amount)
  if (newEntry?.type === 'cash_in') cash_in = sumMoney([cash_in, newEntry.amount])
  if (newEntry?.type === 'cash_out') cash_out = sumMoney([cash_out, newEntry.amount])
  return {
    cash_in,
    cash_out,
    balance: subtractMoney(cash_in, cash_out),
    entry_count: base.entry_count + (newEntry ? 1 : 0) - (oldEntry ? 1 : 0),
  }
}

export const useEntriesStore = create<EntriesState>((set, get) => ({
  entries: [],
  isLoading: false,
  isLoadingMore: false,
  error: null,
  filter: "all",
  currentPage: 0,
  hasMore: true,
  summary: null,
  loadedBookId: null,

  fetchEntries: async (bookId, reset = true) => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) { set({ isLoading: false }); return; }

    const { isOnline } = useOfflineStore.getState();
    const alreadyShowingThisBook = get().loadedBookId === bookId;

    // Only blank the display when we're switching to a DIFFERENT book —
    // that's the case that actually needs protecting (so book A's numbers
    // never bleed into book B). Re-focusing/re-fetching the SAME book
    // should never zero out an already-correct balance just to show a
    // "0" placeholder for the brief moment it takes to re-read the cache
    // or refresh from the server — that produced a guaranteed flash to
    // $0.00 on every single open, regardless of caching, which was being
    // mistaken for a real calculation bug.
    if (reset) {
      if (alreadyShowingThisBook) {
        set({ isLoading: true, currentPage: 0, hasMore: true, error: null });
      } else {
        set({ entries: [], isLoading: true, currentPage: 0, hasMore: true, error: null, summary: null, loadedBookId: bookId })
      }
    } else {
      set({ loadedBookId: bookId });
    }

    // ── Step 1: Load local cache immediately for instant UI ──────
    // This runs regardless of online status so there is NEVER an empty
    // screen while waiting for network, and offline always shows data.
    const localEntries = await localEntriesDb.getByBook(userId, bookId);
    const tempEntries = localEntries.filter(e => e.id.startsWith('local_'));
    const { filter } = get();

    if (localEntries.length > 0) {
      const filtered = filter !== 'all'
        ? localEntries.filter(e => e.type === filter)
        : localEntries;
      set({
        entries: filtered,
        isLoading: !isOnline ? false : true, // done loading if offline
        summary: computeSummary(filtered),
        hasMore: false,
        error: null,
      });
    }

    // ── Step 2: Offline — stay with cache ────────────────────────
    if (!isOnline) {
      set({ isLoading: false });
      return;
    }

    // ── Step 3: Online — fetch fresh data from server ────────────
    try {
      const { data, error } = await entriesService.getEntries(bookId, get().filter, 0);
      const { data: summary, error: summaryError } = await entriesService.getBookSummary(bookId);
      if (summaryError) logger.warn(`[Entries] authoritative summary unavailable for ${bookId}:`, summaryError);

      if (error || !data) {
        // Network failed (expired JWT, timeout, etc.) — keep cache visible
        logger.warn(
          `[Entries] fetchEntries(${bookId}) server fetch failed — keeping cached ${localEntries.length} entries visible. error=`,
          error,
        );
        set({ isLoading: false, error: null }); // don't show error — cache is shown
        return;
      }

      if (data.length === 0 && localEntries.length > 0) {
        logger.warn(
          `[Entries] fetchEntries(${bookId}) server returned 0 entries but local cache had ${localEntries.length}. ` +
          `This usually means an RLS policy or auth/session timing issue is silently filtering rows — ` +
          `check that the Supabase session is fully hydrated before this call, and that "Members can view entries" ` +
          `RLS resolves auth.uid() correctly for this book.`,
        );
      }

      // Merge: temp (offline-created) entries always show at top
      const merged = [...tempEntries, ...data];
      await localEntriesDb.save(userId, bookId, merged);
      set({
        entries: merged,
        isLoading: false,
        error: null,
        currentPage: 0,
        hasMore: data.length === PAGE_SIZE,
        ...(summary ? { summary } : {}),
      });
    } catch (e) {
      // Any uncaught error — stay with whatever cache was loaded in Step 1
      logger.warn(`[Entries] fetchEntries(${bookId}) threw an exception:`, e);
      set({ isLoading: false, error: null });
    }
  },

  loadMore: async (bookId) => {
    if (
      get().isLoadingMore ||
      !get().hasMore ||
      !useOfflineStore.getState().isOnline
    )
      return;
    set({ isLoadingMore: true });
    const nextPage = get().currentPage + 1;
    const { data } = await entriesService.getEntries(
      bookId,
      get().filter,
      nextPage,
    );
    set((state) => ({
      entries: [...state.entries, ...(data ?? [])],
      isLoadingMore: false,
      currentPage: nextPage,
      hasMore: (data?.length ?? 0) === PAGE_SIZE,
    }));
  },

  createEntry: async (bookId, formData) => {
    const amount = normalizeEntryAmount(formData.amount);
    if (!amount) return { error: "Enter an amount greater than 0 and no greater than 9,999,999,999.99, using a dot and up to 2 decimal places." };
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return { error: "Not authenticated" };
    const { isOnline, enqueue } = useOfflineStore.getState();
    const id = genTempId();
    const now = new Date().toISOString();
    const previousSummary = get().summary;
    const optimistic: Entry = {
      id,
      book_id: bookId,
      user_id: userId,
      amount,
      type: formData.type,
      note: formData.note || null,
      entry_date: formData.entry_date.toISOString(),
      created_at: now,
      updated_at: now,
    };
    const delta =
      formData.type === "cash_in"
        ? { cash_in: amount }
        : { cash_out: amount };

    set((state) => {
      const next = [optimistic, ...state.entries]
      return { entries: next, summary: summaryAfterChange(state.summary, state.entries, undefined, optimistic) }
    })
    await localEntriesDb.upsert(userId, bookId, optimistic);
    useBooksStore.getState().updateBookBalance(bookId, delta);

    if (!isOnline) {
      await enqueue({
        id: `op_${id}`,
        type: "CREATE_ENTRY",
        payload: {
          tempId: id,
          book_id: bookId,
          amount,
          type: formData.type,
          note: formData.note || null,
          entry_date: formData.entry_date.toISOString(),
        },
      });
      return { error: null };
    }

    const { data, error } = await entriesService.createEntry(bookId, formData);
    if (error) {
      set((state) => {
        const next = state.entries.filter((e) => e.id !== id)
        return { entries: next, summary: previousSummary ?? computeSummary(next) }
      });
      await localEntriesDb.remove(userId, bookId, id);
      const r =
        formData.type === "cash_in"
          ? { cash_in: subtractMoney(0, amount) }
          : { cash_out: subtractMoney(0, amount) };
      useBooksStore.getState().updateBookBalance(bookId, r);
      return { error };
    }
    set((state) => {
      const next = state.entries.map((e) => (e.id === id ? data! : e));
      return { entries: next, summary: computeSummary(next) };
    });
    await localEntriesDb.remove(userId, bookId, id);
    await localEntriesDb.upsert(userId, bookId, data!);
    return { error: null };
  },

  updateEntry: async (id, formData, bookId) => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return { error: "Not authenticated" };
    const { isOnline, enqueue } = useOfflineStore.getState();
    const existing = get().entries.find((e) => e.id === id);
    if (!existing) return { error: "Entry not found" };
    const normalizedAmount = formData.amount === undefined ? undefined : normalizeEntryAmount(formData.amount);
    if (formData.amount !== undefined && !normalizedAmount) return { error: "Enter an amount greater than 0 and no greater than 9,999,999,999.99, using a dot and up to 2 decimal places." };
    const updated = {
      ...existing,
      ...(formData.amount !== undefined && {
        amount: normalizedAmount!,
      }),
      ...(formData.type !== undefined && { type: formData.type }),
      ...(formData.note !== undefined && { note: formData.note || null }),
      ...(formData.entry_date !== undefined && {
        entry_date: formData.entry_date.toISOString(),
      }),
    };
    const previousSummary = get().summary;
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? updated : e)),
      summary: summaryAfterChange(state.summary, state.entries, existing, updated as Entry),
    }));
    await localEntriesDb.upsert(userId, bookId, updated as Entry);
    if (!isOnline) {
      await enqueue({
        id: `op_upd_${id}_${Date.now()}`,
        type: "UPDATE_ENTRY",
        payload: {
          entryId: id,
          ...formData,
          entry_date: formData.entry_date?.toISOString(),
        },
      });
      return { error: null };
    }
    const { data, error } = await entriesService.updateEntry(id, formData);
    if (error) {
      set((state) => {
        const next = state.entries.map((e) => (e.id === id ? existing : e));
        return { entries: next, summary: previousSummary ?? computeSummary(next) };
      });
      await localEntriesDb.upsert(userId, bookId, existing);
      return { error };
    }
    set((state) => {
      const next = state.entries.map((e) => (e.id === id ? data! : e));
      return { entries: next, summary: computeSummary(next) };
    });
    await localEntriesDb.upsert(userId, bookId, data!);
    useBooksStore.getState().fetchBook(bookId);
    return { error: null };
  },

  deleteEntry: async (id, bookId) => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return { error: "Not authenticated" };
    const { isOnline, enqueue } = useOfflineStore.getState();
    const existing = get().entries.find((e) => e.id === id);
    if (!existing) return { error: "Entry not found" };
    const previousSummary = get().summary;
    set((state) => {
      const next = state.entries.filter((e) => e.id !== id);
      return { entries: next, summary: summaryAfterChange(state.summary, state.entries, existing) };
    });
    await localEntriesDb.remove(userId, bookId, id);
    const r =
      existing.type === "cash_in"
        ? { cash_in: subtractMoney(0, existing.amount) }
        : { cash_out: subtractMoney(0, existing.amount) };
    useBooksStore.getState().updateBookBalance(bookId, r);
    if (!isOnline) {
      await enqueue({
        id: `op_del_${id}`,
        type: "DELETE_ENTRY",
        payload: { entryId: id, bookId },
      });
      return { error: null };
    }
    const { error } = await entriesService.deleteEntry(id);
    if (error) {
      set((state) => {
        const next = [existing, ...state.entries];
        return { entries: next, summary: previousSummary ?? computeSummary(next) };
      });
      await localEntriesDb.upsert(userId, bookId, existing);
      const u =
        existing.type === "cash_in"
          ? { cash_in: existing.amount }
          : { cash_out: existing.amount };
      useBooksStore.getState().updateBookBalance(bookId, u);
      return { error };
    }
    // entries/summary were already updated optimistically above (line ~308);
    // nothing further to recompute here on success.
    return { error: null };
  },

  setFilter: (filter, bookId) => {
    set({ filter });
    get().fetchEntries(bookId);
  },
  addEntryFromRealtime: (entry) => {
    set((state) => {
      if (state.entries.some((e) => e.id === entry.id)) return {};
      return {
        entries: [entry, ...state.entries].sort(
          (a, b) =>
            new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime(),
        ),
      };
    });
  },
  updateEntryFromRealtime: (entry) =>
    set((state) => ({
      entries: state.entries.map((e) => (e.id === entry.id ? entry : e)),
    })),
  removeEntryFromRealtime: (id) =>
    set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),
  reset: () =>
    set({
      entries: [],
      isLoading: false,
      error: null,
      filter: "all",
      currentPage: 0,
      hasMore: true,
      summary: null,
      loadedBookId: null,
    }),
}));
