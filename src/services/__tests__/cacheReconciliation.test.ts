import { mergeEntriesWithPendingMutations, reconcileEmptyServerResponse } from '../cacheReconciliation'
import type { Entry } from '../../types'
import type { PendingOperation } from '../../store/offlineStore'

const entry = (id: string, overrides: Partial<Entry> = {}): Entry => ({
  id,
  book_id: 'book-1',
  user_id: 'user-1',
  amount: '10.00',
  type: 'cash_in',
  note: null,
  entry_date: '2026-10-04T10:00:00.000Z',
  created_at: '2026-10-04T10:00:00.000Z',
  updated_at: '2026-10-04T10:00:00.000Z',
  ...overrides,
})

const create = (userId: string, tempId: string): PendingOperation => ({
  id: `create-${tempId}`,
  type: 'CREATE_ENTRY',
  userId,
  payload: { book_id: 'book-1', tempId, serverId: 'stable-1' },
  createdAt: '2026-10-04T10:00:00.000Z',
  retries: 0,
})

describe('empty server response reconciliation', () => {
  it('classifies locally queued creates as pending and keeps their amount', () => {
    const result = reconcileEmptyServerResponse({
      entries: [entry('local_entry')], queue: [create('user-1', 'local_entry')],
      userId: 'user-1', bookId: 'book-1', summaryCount: 0, summaryError: false,
    })
    expect(result.status).toBe('pending_local')
    expect(result.pendingCount).toBe(1)
    expect(result.entries[0].sync_status).toBe('pending')
  })

  it('flags a non-pending local row against a confirmed empty server for review', () => {
    const result = reconcileEmptyServerResponse({
      entries: [entry('server-like-id')], queue: [], userId: 'user-1', bookId: 'book-1',
      summaryCount: 0, summaryError: false,
    })
    expect(result.status).toBe('needs_reconciliation')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].sync_status).toBe('needs_reconciliation')
  })

  it('distinguishes list incompleteness, authorization errors, and wrong cache context', () => {
    const entries = [entry('entry-1')]
    const base = { entries, queue: [], userId: 'user-1', bookId: 'book-1' }
    expect(reconcileEmptyServerResponse({ ...base, summaryCount: 6, summaryError: false }).status).toBe('incomplete_response')
    expect(reconcileEmptyServerResponse({ ...base, summaryCount: null, summaryError: true }).status).toBe('authorization')
    expect(reconcileEmptyServerResponse({ ...base, entries: [entry('entry-1', { book_id: 'book-2' })], summaryCount: 0, summaryError: false }).status).toBe('wrong_cache_context')
  })

  it('does not infer pending ownership from another account queue item', () => {
    const result = reconcileEmptyServerResponse({
      entries: [entry('local_entry')], queue: [create('user-2', 'local_entry')],
      userId: 'user-1', bookId: 'book-1', summaryCount: 0, summaryError: false,
    })
    expect(result.status).toBe('needs_reconciliation')
    expect(result.pendingCount).toBe(0)
  })

  it('keeps a queued offline delete-all optimistic view empty until server replay completes', () => {
    const queuedDeleteAll = {
      id: 'delete-all-1', type: 'DELETE_BOOK_ENTRIES', userId: 'user-1',
      payload: { bookId: 'book-1' }, createdAt: new Date().toISOString(), retries: 0,
    } as any
    expect(mergeEntriesWithPendingMutations({
      serverEntries: [entry('server-entry')], localEntries: [], queue: [queuedDeleteAll],
      userId: 'user-1', bookId: 'book-1',
    })).toEqual([])
    expect(mergeEntriesWithPendingMutations({
      serverEntries: [entry('server-entry')], localEntries: [], queue: [queuedDeleteAll],
      userId: 'other-user', bookId: 'book-1',
    })).toHaveLength(1)
  })
})

describe('server refresh with local queued mutations', () => {
  it('does not resurrect queued deletions or overwrite queued edits', () => {
    const localUpdated = entry('entry-update', { amount: '25.00', note: 'new note', sync_status: 'pending' })
    const queue: PendingOperation[] = [
      { id: 'delete', type: 'DELETE_ENTRY', userId: 'user-1', payload: { entryId: 'entry-delete', bookId: 'book-1' }, createdAt: '', retries: 0 },
      { id: 'update', type: 'UPDATE_ENTRY', userId: 'user-1', payload: { entryId: 'entry-update', bookId: 'book-1', amount: '25.00', note: 'new note' }, createdAt: '', retries: 0 },
    ]
    const result = mergeEntriesWithPendingMutations({
      serverEntries: [entry('entry-delete'), entry('entry-update', { amount: '10.00', note: 'old note' })],
      localEntries: [localUpdated], queue, userId: 'user-1', bookId: 'book-1',
    })
    expect(result.map(item => item.id)).toEqual(['entry-update'])
    expect(result[0]).toMatchObject({ amount: '25.00', note: 'new note', sync_status: 'pending' })
  })

  it('keeps pending creates and ignores another account queue operations', () => {
    const pending = entry('local_new', { sync_status: 'pending' })
    const result = mergeEntriesWithPendingMutations({
      serverEntries: [], localEntries: [pending],
      queue: [{ id: 'other-delete', type: 'DELETE_ENTRY', userId: 'user-2', payload: { entryId: 'local_new', bookId: 'book-1' }, createdAt: '', retries: 0 }],
      userId: 'user-1', bookId: 'book-1',
    })
    expect(result).toEqual([pending])
  })
})
