// src/hooks/useOfflineSync.ts
// Top-level hook: mounts once in App.tsx.
// - Listens to network state
// - Auto-syncs queue when coming back online
// - Exposes sync status for UI indicators

import { useEffect, useCallback } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { useOfflineStore } from '../store/offlineStore'
import { useAuthStore } from '../store/authStore'
import { useBooksStore } from '../store/booksStore'
import { syncService } from '../services/syncService'

export function useOfflineSync() {
  const { initNetworkListener, isOnline, pendingQueue, syncQueue, isSyncing } = useOfflineStore()
  const { user } = useAuthStore()
  const { fetchBooks } = useBooksStore()

  const runSync = useCallback(async () => {
    if (!user || !isOnline || pendingQueue.length === 0 || isSyncing) return

    await syncQueue(async (ops) => {
      const result = await syncService.replayQueue(ops, user.id)
      return result
    })

    // Refresh books from server after sync
    await fetchBooks()
  }, [user, isOnline, pendingQueue, isSyncing, syncQueue, fetchBooks])

  // Initialize network listener on mount
  useEffect(() => {
    const unsubscribe = initNetworkListener()
    return unsubscribe
  }, [])

  // Sync when coming online
  useEffect(() => {
    if (isOnline && pendingQueue.length > 0) {
      runSync()
    }
  }, [isOnline])

  // Also sync when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && isOnline && pendingQueue.length > 0) {
        runSync()
      }
    })
    return () => sub.remove()
  }, [isOnline, pendingQueue.length, runSync])

  return { isOnline, pendingCount: pendingQueue.length, isSyncing, runSync }
}
