// src/store/offlineStore.ts
// Offline-first queue: operations saved locally and replayed when back online.
//
// KEY FIX: NetInfo.isInternetReachable returns null on Android until a real
// network request is made. We treat null as online so users aren't stuck
// in "offline" mode on startup. If a request actually fails, the caller
// handles it and can call setOnline(false) explicitly.

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { logger } from "@/utils/logger";
import { compactOfflineQueue } from "@/services/offlineQueue";

export type OperationType =
  | "CREATE_BOOK"
  | "UPDATE_BOOK"
  | "DELETE_BOOK"
  | "CREATE_ENTRY"
  | "UPDATE_ENTRY"
  | "DELETE_ENTRY";

export interface PendingOperation {
  id: string;
  type: OperationType;
  payload: Record<string, any>;
  /** Absent only on operations written by older app versions. */
  userId?: string;
  createdAt: string;
  retries: number;
  lastError?: string;
}

const QUEUE_KEY = "cashflow:offline_queue";

interface OfflineState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingQueue: PendingOperation[];
  lastSyncAt: string | null;
  syncError: string | null; // set when sync fails, cleared on next successful sync

  initNetworkListener: () => () => void;
  loadQueue: () => Promise<void>;
  enqueue: (
    op: Omit<PendingOperation, "createdAt" | "retries">,
  ) => Promise<boolean>;
  dequeue: (id: string) => Promise<void>;
  syncQueue: (
    syncFn: (
      ops: PendingOperation[],
    ) => Promise<{ succeeded: string[]; failed: string[]; errors?: Record<string, string> }>,
  ) => Promise<void>;
  clearQueue: () => Promise<void>;
  clearSyncError: () => void;
  setOnline: (online: boolean) => void;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  isOnline: true, // Optimistic default — treat as online until proven otherwise
  isSyncing: false,
  pendingQueue: [],
  lastSyncAt: null,
  syncError: null,

  initNetworkListener: () => {
    get().loadQueue();

    const unsubscribe = NetInfo.addEventListener((state) => {
      // CRITICAL: isInternetReachable is null on Android until a request is made.
      // null means "unknown" not "no internet" — treat null as online.
      // isConnected alone is sufficient for our purposes.
      const online = state.isConnected !== false;

      const prev = get().isOnline;
      set({ isOnline: online });

      if (online && !prev) {
        logger.info("[Offline] Network restored — online");
      } else if (!online && prev) {
        logger.info("[Offline] Network lost — offline");
      }
    });

    return unsubscribe;
  },

  loadQueue: async () => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (raw) {
        const loaded: PendingOperation[] = JSON.parse(raw);
        const queue = compactOfflineQueue(loaded);
        set({ pendingQueue: queue });
        if (JSON.stringify(queue) !== JSON.stringify(loaded)) await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        logger.info(
          "[Offline] Loaded",
          queue.length,
          "pending operations from storage",
        );
      }
    } catch (e) {
      logger.error("[Offline] Failed to load queue:", e);
    }
  },

  enqueue: async (op) => {
    const newOp: PendingOperation = {
      ...op,
      createdAt: new Date().toISOString(),
      retries: 0,
    };
    const next = compactOfflineQueue([...get().pendingQueue, newOp]);
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
      set({ pendingQueue: next });
      logger.info("[Offline] Queued:", op.type, "queue size:", next.length);
      return true;
    } catch (e) {
      logger.error("[Offline] Failed to persist queue:", e);
      set({ syncError: "Could not save the pending change on this device" });
      return false;
    }
  },

  dequeue: async (id) => {
    const next = get().pendingQueue.filter((op) => op.id !== id);
    set({ pendingQueue: next });
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
    } catch (e) {
      logger.error("[Offline] Failed to update queue:", e);
    }
  },

  syncQueue: async (syncFn) => {
    if (get().isSyncing || !get().isOnline || get().pendingQueue.length === 0)
      return;

    set({ isSyncing: true });
    logger.info(
      "[Offline] Starting sync of",
      get().pendingQueue.length,
      "operations",
    );
    try {
      const ops = [...get().pendingQueue];
      const { succeeded, failed, errors = {} } = await syncFn(ops);

      // Don't drop a queued edit that was compacted into the same operation
      // while its earlier snapshot was being sent.
      const sentPayloads = new Map(ops.map(op => [op.id, JSON.stringify(op.payload)]));
      const succeededSet = new Set(succeeded);
      const remaining = get().pendingQueue.filter(op =>
        !succeededSet.has(op.id) || JSON.stringify(op.payload) !== sentPayloads.get(op.id),
      );
      const remainingWithErrors = remaining.map(op => failed.includes(op.id)
        ? { ...op, retries: op.retries + 1, lastError: errors[op.id] ?? 'Sync failed' }
        : op)
      set({
        pendingQueue: remainingWithErrors,
        lastSyncAt: new Date().toISOString(),
        syncError:
          failed.length > 0
            ? `${failed.length} operation${failed.length > 1 ? "s" : ""} failed to sync`
            : null,
      });
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remainingWithErrors));
      logger.info(
        "[Offline] Sync complete — succeeded:",
        succeeded.length,
        "failed:",
        failed.length,
      );
    } catch (e) {
      logger.error("[Offline] Sync failed:", e);
      set({ syncError: "Sync failed — will retry when online" });
    } finally {
      set({ isSyncing: false });
    }
  },

  clearQueue: async () => {
    set({ pendingQueue: [] });
    await AsyncStorage.removeItem(QUEUE_KEY);
  },

  clearSyncError: () => set({ syncError: null }),
  setOnline: (online) => set({ isOnline: online }),
}));
