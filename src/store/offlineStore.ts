// src/store/offlineStore.ts
// Offline-first queue: operations are saved locally and replayed when online.
// Uses AsyncStorage for persistence across app restarts.

import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'

export type OperationType = 'CREATE_BOOK' | 'UPDATE_BOOK' | 'DELETE_BOOK' | 'CREATE_ENTRY' | 'UPDATE_ENTRY' | 'DELETE_ENTRY'

export interface PendingOperation {
  id: string               // local temp id
  type: OperationType
  payload: Record<string, any>
  createdAt: string
  retries: number
}

const QUEUE_KEY = 'cashflow:offline_queue'

interface OfflineState {
  isOnline: boolean
  isSyncing: boolean
  pendingQueue: PendingOperation[]
  lastSyncAt: string | null

  // Actions
  initNetworkListener: () => () => void
  loadQueue: () => Promise<void>
  enqueue: (op: Omit<PendingOperation, 'createdAt' | 'retries'>) => Promise<void>
  dequeue: (id: string) => Promise<void>
  syncQueue: (syncFn: (ops: PendingOperation[]) => Promise<{ succeeded: string[]; failed: string[] }>) => Promise<void>
  clearQueue: () => Promise<void>
  setOnline: (online: boolean) => void
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  isOnline: true,
  isSyncing: false,
  pendingQueue: [],
  lastSyncAt: null,

  initNetworkListener: () => {
    // Load queue from storage first
    get().loadQueue()

    // Subscribe to network changes
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = !!(state.isConnected && state.isInternetReachable)
      const wasOffline = !get().isOnline
      set({ isOnline: online })

      // Auto-trigger sync when coming back online
      if (online && wasOffline && get().pendingQueue.length > 0) {
        // Sync will be triggered by the component/hook that has access to services
        // We emit a custom event here so listeners can react
        set({ isSyncing: false }) // reset, actual sync triggered externally
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
      }
    } catch (e) {
      console.error('[OfflineStore] Failed to load queue:', e)
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
    } catch (e) {
      console.error('[OfflineStore] Failed to persist queue:', e)
    }
  },

  dequeue: async (id) => {
    const next = get().pendingQueue.filter(op => op.id !== id)
    set({ pendingQueue: next })
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next))
    } catch (e) {
      console.error('[OfflineStore] Failed to update queue:', e)
    }
  },

  syncQueue: async (syncFn) => {
    if (get().isSyncing || !get().isOnline || get().pendingQueue.length === 0) return

    set({ isSyncing: true })
    try {
      const ops = [...get().pendingQueue]
      const { succeeded } = await syncFn(ops)

      // Remove successfully synced ops
      const remaining = get().pendingQueue.filter(op => !succeeded.includes(op.id))
      set({ pendingQueue: remaining, lastSyncAt: new Date().toISOString() })
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining))
    } catch (e) {
      console.error('[OfflineStore] Sync failed:', e)
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
