// src/store/entriesStore.ts  (offline-first version)
import { create } from "zustand";
import type { Entry, EntryFormData, EntryFilter } from "../types";
import { entriesService } from "../services/entriesService";
import { localEntriesDb, localBookSummaryDb } from "../services/localDb";
import { useOfflineStore } from "./offlineStore";
import { useAuthStore } from "./authStore";
import { useBooksStore } from "./booksStore";
import { PAGE_SIZE } from "../constants";
import { logger } from "../utils/logger";
import { normalizeEntryAmount, subtractMoney, sumMoney } from "../utils/money";
import { createSyncId } from "../utils/uuid";
import { mergeEntriesWithPendingMutations, reconcileEmptyServerResponse, type ReconciliationStatus } from "../services/cacheReconciliation";

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
  summarySource: 'server' | 'cache' | 'optimistic';
  reconciliation: null | {
    status: ReconciliationStatus;
    localCount: number;
    pendingCount: number;
    serverCount: number | null;
  };

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
  addEntryFromRealtime: (entry: Entry) => Promise<void>;
  updateEntryFromRealtime: (entry: Entry) => Promise<void>;
  removeEntryFromRealtime: (id: string, bookId: string) => Promise<void>;
  reset: () => void;
}

let fetchGeneration = 0

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

async function persistActiveSummary(userId: string, bookId: string) {
  const state = useEntriesStore.getState()
  if (state.loadedBookId === bookId && state.summary) {
    await localBookSummaryDb.save(userId, bookId, state.summary)
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
  summarySource: 'cache',
  reconciliation: null,

  fetchEntries: async (bookId, reset = true) => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) { set({ isLoading: false }); return; }
    const generation = ++fetchGeneration

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
        set({ entries: [], isLoading: true, isLoadingMore: false, currentPage: 0, hasMore: true, error: null, summary: null, summarySource: 'cache', reconciliation: null, loadedBookId: bookId })
      }
    } else {
      set({ loadedBookId: bookId });
    }

    // ── Step 1: Load local cache immediately for instant UI ──────
    // This runs regardless of online status so there is NEVER an empty
    // screen while waiting for network, and offline always shows data.
    const allLocalEntries = await localEntriesDb.getByBook(userId, bookId);
    if (generation !== fetchGeneration || useAuthStore.getState().user?.id !== userId || get().loadedBookId !== bookId) return
    const { filter } = get();
    const localEntries = filter === 'all' ? allLocalEntries : allLocalEntries.filter(e => e.type === filter)
    const cachedSummary = await localBookSummaryDb.get(userId, bookId)
    if (generation !== fetchGeneration || useAuthStore.getState().user?.id !== userId || get().loadedBookId !== bookId) return

    if (localEntries.length > 0) {
      const filtered = filter !== 'all'
        ? localEntries.filter(e => e.type === filter)
        : localEntries;
      set({
        entries: filtered,
        isLoading: !isOnline ? false : true, // done loading if offline
        summary: cachedSummary ?? computeSummary(localEntries),
        summarySource: cachedSummary ? 'cache' : 'cache',
        reconciliation: null,
        hasMore: false,
        error: null,
      });
    }

    // ── Step 2: Offline — stay with cache ────────────────────────
    if (!isOnline) {
      set({ isLoading: false, summarySource: 'cache' });
      return;
    }

    // ── Step 3: Online — fetch fresh data from server ────────────
    try {
      const { data, error } = await entriesService.getEntries(bookId, get().filter, 0, userId);
      const { data: summary, error: summaryError } = await entriesService.getBookSummary(bookId, userId);
      if (generation !== fetchGeneration || useAuthStore.getState().user?.id !== userId || get().loadedBookId !== bookId) return
      if (summaryError) logger.warn(`[Entries] authoritative summary unavailable for ${bookId}:`, summaryError);

      if (error || !data) {
        // Network failed (expired JWT, timeout, etc.) — keep cache visible
        logger.warn(
          `[Entries] fetchEntries(${bookId}) server fetch failed — keeping cached ${localEntries.length} entries visible. error=`,
          error,
        );
        set({ isLoading: false, error: null, summarySource: 'cache', ...(error?.includes('Authenticated account changed') ? { reconciliation: { status: 'authorization' as const, localCount: allLocalEntries.length, pendingCount: 0, serverCount: null } } : {}) }); // don't show error — cache is shown
        return;
      }

      if (data.length === 0 && allLocalEntries.length > 0) {
        const result = reconcileEmptyServerResponse({
          entries: allLocalEntries,
          queue: useOfflineStore.getState().pendingQueue,
          userId,
          bookId,
          summaryCount: summary?.entry_count ?? null,
          summaryError: !!summaryError,
        })
        const { entries: marked, pendingCount, status: reconciliationStatus } = result
        await localEntriesDb.save(userId, bookId, marked)
        logger.warn(
          `[Entries] Reconciliation needed for ${bookId}: authenticated local user ${userId}; local cache ${allLocalEntries.length}; pending local ${pendingCount}; server visible rows 0; authoritative total ${summaryError || !summary ? 'unavailable' : summary.entry_count}. Preserving cached rows.`,
        );
        // Even an authoritative zero cannot establish whether this is a
        // session/RLS mismatch or an out-of-band delete. Never destroy the
        // only remaining local copy automatically; keep the local summary in
        // sync with the rows still displayed and reconcile explicitly.
        set({
          entries: filter === 'all' ? marked : marked.filter(entry => entry.type === filter),
          isLoading: false,
          error: null,
          summary: computeSummary(allLocalEntries),
          summarySource: 'cache',
          reconciliation: { status: reconciliationStatus, localCount: allLocalEntries.length, pendingCount, serverCount: summary?.entry_count ?? null },
        });
        return;
      }

      // Merge: temp (offline-created) entries always show at top
      const refreshed = mergeEntriesWithPendingMutations({
        serverEntries: data,
        localEntries: allLocalEntries,
        queue: useOfflineStore.getState().pendingQueue,
        userId,
        bookId,
      })
      if (get().filter === 'all') await localEntriesDb.save(userId, bookId, refreshed);
      if (summary) await localBookSummaryDb.save(userId, bookId, summary)
      set({
        entries: get().filter === 'all' ? refreshed : refreshed.filter(entry => entry.type === get().filter),
        isLoading: false,
        error: null,
        currentPage: 0,
        hasMore: data.length === PAGE_SIZE,
        ...(summary ? { summary } : {}),
        summarySource: summary ? 'server' : 'cache',
        reconciliation: null,
      });
    } catch (e) {
      // Any uncaught error — stay with whatever cache was loaded in Step 1
      logger.warn(`[Entries] fetchEntries(${bookId}) threw an exception:`, e);
      if (generation === fetchGeneration && useAuthStore.getState().user?.id === userId && get().loadedBookId === bookId) set({ isLoading: false, error: null, summarySource: 'cache' });
    }
  },

  loadMore: async (bookId) => {
    if (
      get().isLoadingMore ||
      !get().hasMore ||
      !useOfflineStore.getState().isOnline
    )
      return;
    const userId = useAuthStore.getState().user?.id
    if (!userId || get().loadedBookId !== bookId) return
    set({ isLoadingMore: true });
    const nextPage = get().currentPage + 1;
    const expectedFilter = get().filter
    const { data, error } = await entriesService.getEntries(
      bookId,
      expectedFilter,
      nextPage,
      userId,
    );
    if (useAuthStore.getState().user?.id !== userId || get().loadedBookId !== bookId || get().filter !== expectedFilter) return
    if (error || !data) { set({ isLoadingMore: false }); return }
    set((state) => ({
      entries: [...state.entries, ...data],
      isLoadingMore: false,
      currentPage: nextPage,
      hasMore: data.length === PAGE_SIZE,
    }));
  },

  createEntry: async (bookId, formData) => {
    const amount = normalizeEntryAmount(formData.amount);
    if (!amount) return { error: "Enter an amount greater than 0 and no greater than 9,999,999,999.99, using a dot and up to 2 decimal places." };
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return { error: "Not authenticated" };
    if (get().loadedBookId !== bookId) return { error: "Book is not active" };
    const { isOnline, enqueue } = useOfflineStore.getState();
    const id = genTempId();
    const serverId = createSyncId();
    const now = new Date().toISOString();
    const previousSummary = get().summary;
    const previousSummarySource = get().summarySource;
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
      sync_status: 'pending',
      sync_id: serverId,
    };
    const delta =
      formData.type === "cash_in"
        ? { cash_in: amount }
        : { cash_out: amount };

    set((state) => {
      if (state.loadedBookId !== bookId) return {}
      const next = [optimistic, ...state.entries]
      return { entries: next, summary: summaryAfterChange(state.summary, state.entries, undefined, optimistic), summarySource: 'optimistic' }
    })
    await persistActiveSummary(userId, bookId)
    await localEntriesDb.upsert(userId, bookId, optimistic);
    useBooksStore.getState().updateBookBalance(bookId, delta);

    if (!isOnline) {
      const queued = await enqueue({
        id: `create-entry:${serverId}`,
        type: "CREATE_ENTRY",
        userId,
        payload: {
          tempId: id,
          serverId,
          book_id: bookId,
          amount,
          type: formData.type,
          note: formData.note || null,
          entry_date: formData.entry_date.toISOString(),
        },
      });
      if (!queued) {
        set((state) => {
          if (state.loadedBookId !== bookId) return {}
          const next = state.entries.filter((entry) => entry.id !== id);
          return { entries: next, summary: previousSummary ?? computeSummary(next), summarySource: previousSummarySource };
        });
        await persistActiveSummary(userId, bookId)
        await localEntriesDb.remove(userId, bookId, id);
        await useBooksStore.getState().updateBookBalance(bookId,
          formData.type === "cash_in" ? { cash_in: subtractMoney(0, amount) } : { cash_out: subtractMoney(0, amount) });
        return { error: "Could not save this entry to the offline queue" };
      }
      return { error: null };
    }

    const { data, error } = await entriesService.createEntry(bookId, formData, serverId);
    if (error) {
      const queued = await enqueue({
        id: `create-entry:${serverId}`,
        type: "CREATE_ENTRY",
        userId,
        payload: { tempId: id, serverId, attemptedOnline: true, book_id: bookId, amount,
          type: formData.type, note: formData.note || null, entry_date: formData.entry_date.toISOString() },
      });
      if (!queued) {
        set((state) => {
          if (state.loadedBookId !== bookId) return {}
          const next = state.entries.filter((entry) => entry.id !== id);
          return { entries: next, summary: previousSummary ?? computeSummary(next), summarySource: previousSummarySource };
        });
        await persistActiveSummary(userId, bookId)
        await localEntriesDb.remove(userId, bookId, id);
        await useBooksStore.getState().updateBookBalance(bookId,
          formData.type === "cash_in" ? { cash_in: subtractMoney(0, amount) } : { cash_out: subtractMoney(0, amount) });
        return { error: `${error}. Pending save could not be stored on this device.` };
      }
      return { error: null };
    }
    set((state) => {
      if (state.loadedBookId !== bookId) return {}
      const next = state.entries.map((e) => (e.id === id ? data! : e));
      return { entries: next, summary: state.summary ?? computeSummary(next), summarySource: 'server' };
    });
    await localEntriesDb.remove(userId, bookId, id);
    await localEntriesDb.upsert(userId, bookId, data!);
    await persistActiveSummary(userId, bookId)
    return { error: null };
  },

  updateEntry: async (id, formData, bookId) => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return { error: "Not authenticated" };
    const { isOnline, enqueue } = useOfflineStore.getState();
    const existing = get().entries.find((e) => e.id === id);
    if (!existing || existing.book_id !== bookId || get().loadedBookId !== bookId) return { error: "Entry not found in the active book" };
    const normalizedAmount = formData.amount === undefined ? undefined : normalizeEntryAmount(formData.amount);
    if (formData.amount !== undefined && !normalizedAmount) return { error: "Enter an amount greater than 0 and no greater than 9,999,999,999.99, using a dot and up to 2 decimal places." };
    const updated = {
      ...existing,
      sync_status: 'pending' as const,
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
    const previousSummarySource = get().summarySource;
    const bookDelta = {
      cash_in: subtractMoney(updated.type === "cash_in" ? updated.amount : 0, existing.type === "cash_in" ? existing.amount : 0),
      cash_out: subtractMoney(updated.type === "cash_out" ? updated.amount : 0, existing.type === "cash_out" ? existing.amount : 0),
    };
    set((state) => ({
      ...(state.loadedBookId !== bookId ? {} : {
      entries: state.entries.map((e) => (e.id === id ? updated : e)),
      summary: summaryAfterChange(state.summary, state.entries, existing, updated as Entry),
      summarySource: 'optimistic',
      }),
    }));
    await persistActiveSummary(userId, bookId)
    await localEntriesDb.upsert(userId, bookId, updated as Entry);
    await useBooksStore.getState().updateBookBalance(bookId, bookDelta);
    if (!isOnline) {
      const queued = await enqueue({
        id: `op_upd_${id}_${Date.now()}`,
        type: "UPDATE_ENTRY",
        userId,
        payload: {
          entryId: id,
          bookId,
          ...formData,
          entry_date: formData.entry_date?.toISOString(),
        },
      });
      if (!queued) {
        set((state) => state.loadedBookId !== bookId ? {} : ({ entries: state.entries.map((entry) => entry.id === id ? existing : entry), summary: previousSummary ?? computeSummary(state.entries), summarySource: previousSummarySource }));
        await persistActiveSummary(userId, bookId)
        await localEntriesDb.upsert(userId, bookId, existing);
        await useBooksStore.getState().updateBookBalance(bookId, {
          cash_in: subtractMoney(0, bookDelta.cash_in), cash_out: subtractMoney(0, bookDelta.cash_out),
        });
        return { error: "Could not save this edit to the offline queue" };
      }
      return { error: null };
    }
    const { data, error } = await entriesService.updateEntry(id, formData);
    if (error) {
      const queued = await enqueue({
        id: `op_upd_${id}_${Date.now()}`,
        type: "UPDATE_ENTRY",
        userId,
        payload: { entryId: id, bookId,
          ...(normalizedAmount !== undefined ? { amount: normalizedAmount } : {}),
          ...(formData.type !== undefined ? { type: formData.type } : {}),
          ...(formData.note !== undefined ? { note: formData.note || null } : {}),
          ...(formData.entry_date !== undefined ? { entry_date: formData.entry_date.toISOString() } : {}) },
      });
      if (queued) return { error: null };
      set((state) => ({
        ...(state.loadedBookId !== bookId ? {} : {
        entries: state.entries.map((entry) => entry.id === id ? existing : entry),
        summary: previousSummary ?? computeSummary(state.entries),
        summarySource: previousSummarySource,
        }),
      }));
      await persistActiveSummary(userId, bookId)
      await localEntriesDb.upsert(userId, bookId, existing);
      await useBooksStore.getState().updateBookBalance(bookId, {
        cash_in: subtractMoney(0, bookDelta.cash_in),
        cash_out: subtractMoney(0, bookDelta.cash_out),
      });
      return { error: `${error}. Pending edit could not be stored on this device.` };
    }
    set((state) => {
      if (state.loadedBookId !== bookId) return {}
      const next = state.entries.map((e) => (e.id === id ? data! : e));
      return { entries: next.map(entry => entry.id === id ? { ...data!, sync_status: 'synced' as const } : entry), summary: state.summary ?? computeSummary(next), summarySource: 'server' };
    });
    await persistActiveSummary(userId, bookId)
    await localEntriesDb.upsert(userId, bookId, data!);
    if (get().loadedBookId === bookId) useBooksStore.getState().fetchBook(bookId);
    return { error: null };
  },

  deleteEntry: async (id, bookId) => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return { error: "Not authenticated" };
    const { isOnline, enqueue } = useOfflineStore.getState();
    const existing = get().entries.find((e) => e.id === id);
    if (!existing || existing.book_id !== bookId || get().loadedBookId !== bookId) return { error: "Entry not found in the active book" };
    const previousSummary = get().summary;
    const previousSummarySource = get().summarySource;
    set((state) => {
      if (state.loadedBookId !== bookId) return {}
      const next = state.entries.filter((e) => e.id !== id);
      return { entries: next, summary: summaryAfterChange(state.summary, state.entries, existing), summarySource: 'optimistic' };
    });
    await persistActiveSummary(userId, bookId)
    await localEntriesDb.remove(userId, bookId, id);
    const r =
      existing.type === "cash_in"
        ? { cash_in: subtractMoney(0, existing.amount) }
        : { cash_out: subtractMoney(0, existing.amount) };
    useBooksStore.getState().updateBookBalance(bookId, r);
    if (!isOnline) {
      const queued = await enqueue({
        id: `op_del_${id}`,
        type: "DELETE_ENTRY",
        userId,
        payload: { entryId: id, bookId },
      });
      if (!queued) {
        set((state) => state.loadedBookId !== bookId ? {} : ({ entries: [existing, ...state.entries], summary: previousSummary ?? computeSummary(state.entries), summarySource: previousSummarySource }));
        await persistActiveSummary(userId, bookId)
        await localEntriesDb.upsert(userId, bookId, existing);
        await useBooksStore.getState().updateBookBalance(bookId, {
          cash_in: existing.type === "cash_in" ? existing.amount : 0,
          cash_out: existing.type === "cash_out" ? existing.amount : 0,
        });
        return { error: "Could not save this delete to the offline queue" };
      }
      return { error: null };
    }
    const { error } = await entriesService.deleteEntry(id);
    if (error) {
      const queued = await enqueue({ id: `op_del_${id}`, type: "DELETE_ENTRY", userId, payload: { entryId: id, bookId } });
      if (queued) return { error: null };
      set((state) => ({
        ...(state.loadedBookId !== bookId ? {} : {
        entries: [existing, ...state.entries],
        summary: previousSummary ?? computeSummary(state.entries),
        summarySource: previousSummarySource,
        }),
      }));
      await persistActiveSummary(userId, bookId)
      await localEntriesDb.upsert(userId, bookId, existing);
      await useBooksStore.getState().updateBookBalance(bookId, {
        cash_in: existing.type === "cash_in" ? existing.amount : 0,
        cash_out: existing.type === "cash_out" ? existing.amount : 0,
      });
      return { error: `${error}. Pending delete could not be stored on this device.` };
    }
    // entries/summary were already updated optimistically above (line ~308);
    // nothing further to recompute here on success.
    return { error: null };
  },

  setFilter: (filter, bookId) => {
    set({ filter });
    get().fetchEntries(bookId);
  },
  addEntryFromRealtime: async (entry) => {
    const userId = useAuthStore.getState().user?.id
    if (!userId || !useAuthStore.getState().isAuthenticated || get().loadedBookId !== entry.book_id) return
    const queue = useOfflineStore.getState().pendingQueue
    const pendingCreate = queue.find(op => op.type === 'CREATE_ENTRY' && op.userId === userId && op.payload.serverId === entry.id)
    const cached = await localEntriesDb.getByBook(userId, entry.book_id)
    if (useAuthStore.getState().user?.id !== userId || get().loadedBookId !== entry.book_id) return
    const localMatch = cached.find(item => item.id === entry.id || item.sync_id === entry.id || (pendingCreate && item.id === pendingCreate.payload.tempId))
    const wasAlreadyPresent = !!localMatch
    const nextCache = localMatch
      ? cached.map(item => item === localMatch ? { ...entry, sync_status: 'synced' as const } : item)
      : [ { ...entry, sync_status: 'synced' as const }, ...cached ]
    await localEntriesDb.save(userId, entry.book_id, nextCache)
    set(state => {
      if (state.loadedBookId !== entry.book_id) return {}
      const withoutDuplicate = state.entries.filter(item => item.id !== entry.id && item.sync_id !== entry.id && !(pendingCreate && item.id === pendingCreate.payload.tempId))
      const list = state.filter === 'all' || entry.type === state.filter
        ? [ { ...entry, sync_status: 'synced' as const }, ...withoutDuplicate ]
        : withoutDuplicate
      return {
        entries: list.sort((a,b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()),
        summary: wasAlreadyPresent ? state.summary : summaryAfterChange(state.summary, state.entries, undefined, entry),
        summarySource: 'server',
      }
    })
    const summaryAfterRealtime = get().summary
    if (summaryAfterRealtime) await localBookSummaryDb.save(userId, entry.book_id, summaryAfterRealtime)
  },
  updateEntryFromRealtime: async (entry) => {
    const userId = useAuthStore.getState().user?.id
    if (!userId || !useAuthStore.getState().isAuthenticated || get().loadedBookId !== entry.book_id) return
    const queue = useOfflineStore.getState().pendingQueue
    const hasPendingEdit = queue.some(op => op.userId === userId && op.type === 'UPDATE_ENTRY' && (op.payload.entryId ?? op.payload.entry_id) === entry.id)
    if (hasPendingEdit) return // don't overwrite a newer local edit with an older realtime row
    const cached = await localEntriesDb.getByBook(userId, entry.book_id)
    if (useAuthStore.getState().user?.id !== userId || get().loadedBookId !== entry.book_id) return
    const previous = cached.find(item => item.id === entry.id)
    const nextCache = previous
      ? cached.map(item => item.id === entry.id ? { ...entry, sync_status: 'synced' as const } : item)
      : cached
    await localEntriesDb.save(userId, entry.book_id, nextCache)
    set(state => {
      const old = state.entries.find(item => item.id === entry.id)
      const previousForSummary = previous ?? old
      const visible = state.filter === 'all' || entry.type === state.filter
      const nextEntries = state.entries.filter(item => item.id !== entry.id)
      if (visible) nextEntries.push({ ...entry, sync_status: 'synced' })
      return {
        entries: nextEntries.sort((a,b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()),
        summary: previousForSummary ? summaryAfterChange(state.summary, state.entries, previousForSummary, entry) : state.summary,
        summarySource: 'server',
      }
    })
    const summaryAfterRealtime = get().summary
    if (summaryAfterRealtime) await localBookSummaryDb.save(userId, entry.book_id, summaryAfterRealtime)
  },
  removeEntryFromRealtime: async (id, bookId) => {
    const userId = useAuthStore.getState().user?.id
    if (!userId || !useAuthStore.getState().isAuthenticated || get().loadedBookId !== bookId) return
    const queue = useOfflineStore.getState().pendingQueue
    const hasPendingMutation = queue.some(op => op.userId === userId &&
      (op.type === 'UPDATE_ENTRY' || op.type === 'DELETE_ENTRY' || op.type === 'CREATE_ENTRY') &&
      ((op.payload.entryId ?? op.payload.entry_id ?? op.payload.serverId) === id))
    const cached = await localEntriesDb.getByBook(userId, bookId)
    if (useAuthStore.getState().user?.id !== userId || get().loadedBookId !== bookId) return
    const old = cached.find(item => item.id === id)
    if (hasPendingMutation) {
      await localEntriesDb.save(userId, bookId, cached.map(item => item.id === id ? { ...item, sync_status: 'needs_reconciliation' as const } : item))
      set(state => ({
        entries: state.entries.map(item => item.id === id ? { ...item, sync_status: 'needs_reconciliation' } : item),
        reconciliation: { status: 'needs_reconciliation', localCount: cached.length, pendingCount: 0, serverCount: null },
      }))
      return
    }
    await localEntriesDb.save(userId, bookId, cached.filter(item => item.id !== id))
    set(state => ({
      entries: state.entries.filter(item => item.id !== id),
      summary: old ? summaryAfterChange(state.summary, state.entries, old) : state.summary,
      summarySource: 'server',
    }))
    const summaryAfterRealtime = get().summary
    if (summaryAfterRealtime) await localBookSummaryDb.save(userId, bookId, summaryAfterRealtime)
  },
  reset: () => {
    fetchGeneration++
    set({
      entries: [],
      isLoading: false,
      error: null,
      filter: "all",
      currentPage: 0,
      hasMore: true,
      summary: null,
      loadedBookId: null,
      summarySource: 'cache',
      reconciliation: null,
    })
  },
}));
