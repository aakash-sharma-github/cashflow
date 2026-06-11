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

export function useOfflineSync() {
  const { initNetworkListener, isOnline, pendingQueue, syncQueue, isSyncing } = useOfflineStore()
  const { user, isAuthenticated } = useAuthStore()
  const { fetchBooks } = useBooksStore()
  const { fetchEntries } = useEntriesStore()

  // Track the last known bookId so we can refresh entries after sync
  const currentBookIdRef = useRef<string | null>(null)

  const runSync = useCallback(async () => {
    if (!user || !isOnline || pendingQueue.length === 0 || isSyncing) return

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
  }, [user, isOnline, pendingQueue.length, isSyncing, syncQueue, fetchBooks, fetchEntries])

  // Initialize network listener once on mount
  useEffect(() => {
    const unsubscribe = initNetworkListener()
    return unsubscribe
  }, [])

  // Sync on mount if already online with pending items
  // (covers the case where app was killed while offline and restarted online)
  useEffect(() => {
    if (isAuthenticated && isOnline && pendingQueue.length > 0) {
      runSync()
    }
  }, [isAuthenticated]) // Only runs when auth state settles — not on every online change

  // Sync when network comes back online
  useEffect(() => {
    if (isOnline && pendingQueue.length > 0) {
      runSync()
    }
  }, [isOnline]) // Runs specifically when isOnline flips true

  // Sync when app comes to foreground (catches background kills)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && isOnline && pendingQueue.length > 0) {
        runSync()
      }
    })
    return () => sub.remove()
  }, [isOnline, pendingQueue.length, runSync])

  return {
    isOnline,
    pendingCount: pendingQueue.length,
    isSyncing,
    runSync,
    setCurrentBookId: (id: string | null) => { currentBookIdRef.current = id },
  }
}