// src/store/offlineStore.ts
// Offline-first queue: operations saved locally and replayed when back online.
//
// KEY FIX: NetInfo.isInternetReachable returns null on Android until a real
// network request is made. We treat null as online so users aren't stuck
// in "offline" mode on startup. If a request actually fails, the caller
// handles it and can call setOnline(false) explicitly.

import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'

export type OperationType =
  | 'CREATE_BOOK'
  | 'CREATE_ENTRY'
  | 'UPDATE_ENTRY'
  | 'DELETE_ENTRY'
  | 'UPDATE_BOOK'
  | 'DELETE_BOOK'

export interface PendingOperation {
  id: string
  type: OperationType
  payload: Record<string, any>
  createdAt: string
  retries: number
  allOps?: PendingOperation[]  // Optional reference to entire queue for context during sync
}

const QUEUE_KEY = 'cashflow:offline_queue'

interface OfflineState {
  isOnline: boolean
  isSyncing: boolean
  pendingQueue: PendingOperation[]
  lastSyncAt: string | null

  syncError: string | null
  clearSyncError: () => void

  initNetworkListener: () => () => void
  loadQueue: () => Promise<void>
  enqueue: (op: Omit<PendingOperation, 'createdAt' | 'retries'>) => Promise<void>
  dequeue: (id: string) => Promise<void>
  syncQueue: (syncFn: (ops: PendingOperation[]) => Promise<{ succeeded: string[]; failed: string[] }>) => Promise<void>
  clearQueue: () => Promise<void>
  setOnline: (online: boolean) => void
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  isOnline: true,   // Optimistic default — treat as online until proven otherwise
  isSyncing: false,
  pendingQueue: [],
  lastSyncAt: null,
  syncError: null,

  clearSyncError: () => set({ syncError: null }),

  initNetworkListener: () => {
    get().loadQueue()

    const unsubscribe = NetInfo.addEventListener(state => {
      // CRITICAL: isInternetReachable is null on Android until a request is made.
      // null means "unknown" not "no internet" — treat null as online.
      // isConnected alone is sufficient for our purposes.
      const online = state.isConnected !== false

      const prev = get().isOnline
      set({ isOnline: online })

      if (online && !prev) {
        console.log('[Offline] Network restored — online')
      } else if (!online && prev) {
        console.log('[Offline] Network lost — offline')
      }
    })

    return unsubscribe
  },

  loadQueue: async () => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY)
      if (raw) {
        const queue: PendingOperation[] = JSON.parse(raw)
        set({ pendingQueue: queue })
        console.log('[Offline] Loaded', queue.length, 'pending operations from storage')
      }
    } catch (e) {
      console.error('[Offline] Failed to load queue:', e)
    }
  },

  enqueue: async (op) => {
    const newOp: PendingOperation = {
      ...op,
      createdAt: new Date().toISOString(),
      retries: 0,
    }
    const next = [...get().pendingQueue, newOp]
    set({ pendingQueue: next })
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next))
      console.log('[Offline] Queued:', op.type, 'queue size:', next.length)
    } catch (e) {
      console.error('[Offline] Failed to persist queue:', e)
    }
  },

  dequeue: async (id) => {
    const next = get().pendingQueue.filter(op => op.id !== id)
    set({ pendingQueue: next })
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next))
    } catch (e) {
      console.error('[Offline] Failed to update queue:', e)
    }
  },

  syncQueue: async (syncFn) => {
    if (get().isSyncing || !get().isOnline || get().pendingQueue.length === 0) return

    set({ isSyncing: true })
    console.log('[Offline] Starting sync of', get().pendingQueue.length, 'operations')
    try {
      const ops = [...get().pendingQueue]
      const { succeeded, failed } = await syncFn(ops)

      const remaining = get().pendingQueue.filter(op => !succeeded.includes(op.id))
      set({ pendingQueue: remaining, lastSyncAt: new Date().toISOString() })
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining))
      console.log('[Offline] Sync complete — succeeded:', succeeded.length, 'failed:', failed.length)
    } catch (e) {
      console.error('[Offline] Sync failed:', e)
    } finally {
      set({ isSyncing: false })
    }
  },

  clearQueue: async () => {
    set({ pendingQueue: [] })
    await AsyncStorage.removeItem(QUEUE_KEY)
  },

  setOnline: (online) => set({ isOnline: online }),
}))