// src/store/entriesStore.ts  (offline-first version)
import { create } from "zustand";
import type { Entry, EntryFormData, EntryFilter } from "../types";
import { entriesService } from "../services/entriesService";
import { localEntriesDb } from "../services/localDb";
import { useOfflineStore } from "./offlineStore";
import { useAuthStore } from "./authStore";
import { useBooksStore } from "./booksStore";
import { PAGE_SIZE } from "../constants";

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
    balance: number;
    cash_in: number;
    cash_out: number;
    entry_count: number;
  } | null;

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
  const cash_in = entries
    .filter((e) => e.type === "cash_in")
    .reduce((s, e) => s + Number(e.amount), 0);
  const cash_out = entries
    .filter((e) => e.type === "cash_out")
    .reduce((s, e) => s + Number(e.amount), 0);
  return {
    cash_in,
    cash_out,
    balance: cash_in - cash_out,
    entry_count: entries.length,
  };
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

  fetchEntries: async (bookId, reset = true) => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      set({ isLoading: false });
      return;
    } // guard: not authenticated yet
    const { isOnline } = useOfflineStore.getState();
    if (reset)
      set({
        isLoading: true,
        entries: [],
        currentPage: 0,
        hasMore: true,
        error: null,
      });

    if (!isOnline) {
      let local = await localEntriesDb.getByBook(userId, bookId);
      const { filter } = get();
      if (filter !== "all") local = local.filter((e) => e.type === filter);
      set({
        entries: local,
        isLoading: false,
        summary: computeSummary(local),
        hasMore: false,
      });
      return;
    }

    const { data, error } = await entriesService.getEntries(
      bookId,
      get().filter,
      0,
    );
    const { data: summary } = await entriesService.getBookSummary(bookId);
    const localEntries = await localEntriesDb.getByBook(userId, bookId);
    const tempEntries = localEntries.filter((e) => e.id.startsWith("local_"));
    const merged = [...tempEntries, ...(data ?? [])];
    if (data)
      await localEntriesDb.save(userId, bookId, [...tempEntries, ...data]);
    set({
      entries: merged,
      isLoading: false,
      error,
      currentPage: 0,
      hasMore: (data?.length ?? 0) === PAGE_SIZE,
      summary: summary ?? computeSummary(merged),
    });
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
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return { error: "Not authenticated" };
    const { isOnline, enqueue } = useOfflineStore.getState();
    const id = genTempId();
    const now = new Date().toISOString();
    const optimistic: Entry = {
      id,
      book_id: bookId,
      user_id: userId,
      amount: parseFloat(formData.amount),
      type: formData.type,
      note: formData.note || null,
      entry_date: formData.entry_date.toISOString(),
      created_at: now,
      updated_at: now,
    };
    const delta =
      formData.type === "cash_in"
        ? { cash_in: parseFloat(formData.amount) }
        : { cash_out: parseFloat(formData.amount) };

    set((state) => ({ entries: [optimistic, ...state.entries] }));
    await localEntriesDb.upsert(userId, bookId, optimistic);
    useBooksStore.getState().updateBookBalance(bookId, delta);

    if (!isOnline) {
      await enqueue({
        id: `op_${id}`,
        type: "CREATE_ENTRY",
        payload: {
          tempId: id,
          book_id: bookId,
          amount: parseFloat(formData.amount),
          type: formData.type,
          note: formData.note || null,
          entry_date: formData.entry_date.toISOString(),
        },
      });
      return { error: null };
    }

    const { data, error } = await entriesService.createEntry(bookId, formData);
    if (error) {
      set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }));
      await localEntriesDb.remove(userId, bookId, id);
      const r =
        formData.type === "cash_in"
          ? { cash_in: -parseFloat(formData.amount) }
          : { cash_out: -parseFloat(formData.amount) };
      useBooksStore.getState().updateBookBalance(bookId, r);
      return { error };
    }
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? data! : e)),
      summary: state.summary
        ? {
            ...state.summary,
            cash_in:
              state.summary.cash_in +
              (formData.type === "cash_in" ? parseFloat(formData.amount) : 0),
            cash_out:
              state.summary.cash_out +
              (formData.type === "cash_out" ? parseFloat(formData.amount) : 0),
            balance:
              state.summary.balance +
              (formData.type === "cash_in" ? 1 : -1) *
                parseFloat(formData.amount),
            entry_count: state.summary.entry_count + 1,
          }
        : null,
    }));
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
    const updated = {
      ...existing,
      ...(formData.amount !== undefined && {
        amount: parseFloat(formData.amount),
      }),
      ...(formData.type !== undefined && { type: formData.type }),
      ...(formData.note !== undefined && { note: formData.note || null }),
      ...(formData.entry_date !== undefined && {
        entry_date: formData.entry_date.toISOString(),
      }),
    };
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? updated : e)),
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
      set((state) => ({
        entries: state.entries.map((e) => (e.id === id ? existing : e)),
      }));
      await localEntriesDb.upsert(userId, bookId, existing);
      return { error };
    }
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? data! : e)),
    }));
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
    set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }));
    await localEntriesDb.remove(userId, bookId, id);
    const r =
      existing.type === "cash_in"
        ? { cash_in: -existing.amount }
        : { cash_out: -existing.amount };
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
      set((state) => ({ entries: [existing, ...state.entries] }));
      await localEntriesDb.upsert(userId, bookId, existing);
      const u =
        existing.type === "cash_in"
          ? { cash_in: existing.amount }
          : { cash_out: existing.amount };
      useBooksStore.getState().updateBookBalance(bookId, u);
      return { error };
    }
    set((state) => ({
      summary: state.summary
        ? {
            ...state.summary,
            cash_in:
              state.summary.cash_in -
              (existing.type === "cash_in" ? existing.amount : 0),
            cash_out:
              state.summary.cash_out -
              (existing.type === "cash_out" ? existing.amount : 0),
            balance:
              state.summary.balance +
              (existing.type === "cash_in" ? -1 : 1) * existing.amount,
            entry_count: Math.max(0, state.summary.entry_count - 1),
          }
        : null,
    }));
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
    }),
}));
