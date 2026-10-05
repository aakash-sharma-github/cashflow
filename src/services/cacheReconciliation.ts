import type { Entry } from '../types'
import type { PendingOperation } from '../store/offlineStore'

export type ReconciliationStatus =
  | 'authorization'
  | 'pending_local'
  | 'needs_reconciliation'
  | 'incomplete_response'
  | 'wrong_cache_context'

export function mergeEntriesWithPendingMutations(args: {
  serverEntries: Entry[]
  localEntries: Entry[]
  queue: PendingOperation[]
  userId: string
  bookId: string
}): Entry[] {
  const { serverEntries, localEntries, queue, userId, bookId } = args
  const relevant = queue.filter(op => op.userId === userId &&
    (op.payload.book_id ?? op.payload.bookId) === bookId)
  if (relevant.some(op => op.type === 'DELETE_BOOK_ENTRIES')) return []
  const createAliases = new Map<string, string>()
  for (const op of relevant) {
    if (op.type === 'CREATE_ENTRY' && op.payload.tempId && op.payload.serverId) {
      createAliases.set(op.payload.tempId, op.payload.serverId)
    }
  }
  const deletes = new Set(relevant.filter(op => op.type === 'DELETE_ENTRY').flatMap(op => {
    const id = op.payload.entryId ?? op.payload.entry_id
    return [id, id ? createAliases.get(id) : undefined].filter(Boolean)
  }))
  const updates = new Map<string, Record<string, any>>()
  for (const op of relevant) {
    if (op.type === 'UPDATE_ENTRY') {
      const id = op.payload.entryId ?? op.payload.entry_id
      if (id) updates.set(id, { ...(updates.get(id) ?? {}), ...op.payload })
    }
  }
  const localById = new Map(localEntries.map(entry => [entry.id, entry]))
  const merged: Entry[] = []
  for (const serverEntry of serverEntries) {
    if (deletes.has(serverEntry.id)) continue
    const queuedUpdate = updates.get(serverEntry.id)
    const local = localById.get(serverEntry.id)
    if (!queuedUpdate) {
      merged.push({ ...serverEntry, sync_status: 'synced' })
      continue
    }
    if (local) {
      merged.push({ ...local, sync_status: 'pending' })
      continue
    }
    merged.push({
      ...serverEntry,
      ...(queuedUpdate.amount !== undefined ? { amount: queuedUpdate.amount } : {}),
      ...(queuedUpdate.type !== undefined ? { type: queuedUpdate.type } : {}),
      ...(queuedUpdate.note !== undefined ? { note: queuedUpdate.note } : {}),
      ...(queuedUpdate.entry_date !== undefined ? { entry_date: queuedUpdate.entry_date } : {}),
      sync_status: 'pending' as const,
    })
  }
  const creates = relevant.filter(op => op.type === 'CREATE_ENTRY')
  const createRefs = new Set(creates.flatMap(op => [op.payload.tempId, op.payload.serverId].filter(Boolean)))
  for (const entry of localEntries) {
    if (deletes.has(entry.id) || (entry.sync_id && deletes.has(entry.sync_id))) continue
    if (entry.id.startsWith('local_') || entry.sync_status === 'pending' || createRefs.has(entry.id) || (!!entry.sync_id && createRefs.has(entry.sync_id))) {
      if (!merged.some(item => item.id === entry.id || item.id === entry.sync_id || item.sync_id === entry.sync_id)) {
        merged.unshift({ ...entry, sync_status: 'pending' as const })
      }
    }
  }
  return merged.sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())
}

export function reconcileEmptyServerResponse(args: {
  entries: Entry[]
  queue: PendingOperation[]
  userId: string
  bookId: string
  summaryCount: number | null
  summaryError: boolean
}): { entries: Entry[]; status: ReconciliationStatus; pendingCount: number; localCount: number; serverCount: number | null } {
  const { entries, queue, userId, bookId, summaryCount, summaryError } = args
  // entry.user_id is the entry creator and may legitimately differ for shared
  // books. The local DB namespace establishes cache ownership by user ID.
  const wrongContext = entries.some(entry => entry.book_id !== bookId)
  const relevantQueue = queue.filter(op =>
    op.userId === userId && (op.type === 'CREATE_ENTRY' || op.type === 'UPDATE_ENTRY') &&
    (op.payload.book_id ?? op.payload.bookId) === bookId,
  )
  const pendingRefs = new Set(relevantQueue.flatMap(op => [
    op.payload.tempId, op.payload.serverId, op.payload.entryId, op.payload.entry_id,
  ].filter(Boolean)))
  const marked = entries.map(entry => {
    const isPending = pendingRefs.has(entry.id) || (!!entry.sync_id && pendingRefs.has(entry.sync_id))
    return { ...entry, sync_status: isPending ? 'pending' as const : 'needs_reconciliation' as const }
  })
  const pendingCount = marked.filter(entry => entry.sync_status === 'pending').length

  let status: ReconciliationStatus
  if (wrongContext) status = 'wrong_cache_context'
  else if (summaryError || summaryCount === null) status = 'authorization'
  else if (summaryCount > 0) status = 'incomplete_response'
  else if (pendingCount === marked.length) status = 'pending_local'
  else status = 'needs_reconciliation'

  return { entries: marked, status, pendingCount, localCount: entries.length, serverCount: summaryCount }
}
