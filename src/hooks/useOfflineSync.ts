// src/hooks/useOfflineSync.ts
// Mounts once in App.tsx. Handles:
//   - Network state monitoring
//   - Auto-sync when coming back online
//   - Sync on app foreground (catches up missed operations)
//   - Initial sync on mount (handles queue from previous app session)

import { useEffect, useRef, useCallback } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { useOfflineStore } from '../store/offlineStore'
import { useAuthStore } from '../store/authStore'
import { useBooksStore } from '../store/booksStore'
import { useEntriesStore } from '../store/entriesStore'
import { syncService } from '../services/syncService'
import { logger } from '@/utils/logger'

export function useOfflineSync(enableLifecycle = true) {
  const { initNetworkListener, isOnline, pendingQueue, syncQueue, isSyncing } = useOfflineStore()
  const { user, isAuthenticated } = useAuthStore()
  const isOfflineMode = useAuthStore(s => s.isOfflineMode)
  const resolveOnlineSession = useAuthStore(s => s.resolveOnlineSession)
  const { fetchBooks } = useBooksStore()
  const { fetchEntries } = useEntriesStore()

  // Track the last known bookId so we can refresh entries after sync
  const currentBookIdRef = useRef<string | null>(null)

  const runSync = useCallback(async () => {
    if (!isAuthenticated || !user || !isOnline || pendingQueue.length === 0 || isSyncing) return

    logger.info('[Sync] Running sync of', pendingQueue.length, 'queued operations')

    await syncQueue(async (ops) => {
      return syncService.replayQueue(ops, user.id)
    })

    // Refresh data from server after sync so UI shows server-confirmed state
    await fetchBooks()

    // Refresh current book's entries if we know which book is open
    if (currentBookIdRef.current) {
      await fetchEntries(currentBookIdRef.current, true)
    }
  }, [user, isAuthenticated, isOnline, pendingQueue.length, isSyncing, syncQueue, fetchBooks, fetchEntries])

  // Initialize network listener once on mount
  useEffect(() => {
    if (!enableLifecycle) return
    const unsubscribe = initNetworkListener()
    return unsubscribe
  }, [enableLifecycle, initNetworkListener])

  // Sync when auth, network, or queue hydration makes replay possible.
  useEffect(() => {
    if (enableLifecycle && isAuthenticated && isOnline && pendingQueue.length > 0) {
      runSync()
    }
  }, [enableLifecycle, isAuthenticated, isOnline, pendingQueue.length, runSync])

  useEffect(() => {
    if (enableLifecycle && isOnline && isOfflineMode) void resolveOnlineSession()
  }, [enableLifecycle, isOnline, isOfflineMode, resolveOnlineSession])

  // Sync when app comes to foreground (catches background kills)
  useEffect(() => {
    if (!enableLifecycle) return
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && isOnline && pendingQueue.length > 0) {
        runSync()
      }
      if (state === 'active' && isOnline && isOfflineMode) void resolveOnlineSession()
    })
    return () => sub.remove()
  }, [enableLifecycle, isOnline, isOfflineMode, pendingQueue.length, runSync, resolveOnlineSession])

  return {
    isOnline,
    pendingCount: pendingQueue.length,
    isSyncing,
    runSync,
    setCurrentBookId: (id: string | null) => { currentBookIdRef.current = id },
  }
}
