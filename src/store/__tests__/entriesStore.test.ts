jest.mock('../../services/entriesService', () => ({
  entriesService: { getEntries: jest.fn(), getBookSummary: jest.fn(), createEntry: jest.fn() },
}))
jest.mock('../../services/localDb', () => ({
  localEntriesDb: { getByBook: jest.fn().mockResolvedValue([]), save: jest.fn(), upsert: jest.fn(), remove: jest.fn() },
  localBookSummaryDb: { get: jest.fn().mockResolvedValue(null), save: jest.fn() },
}))
jest.mock('../authStore', () => ({ useAuthStore: { getState: () => ({ user: { id: 'user-1' }, isAuthenticated: true }) } }))
jest.mock('../offlineStore', () => ({
  useOfflineStore: { getState: () => ({ isOnline: true, pendingQueue: [], enqueue: jest.fn().mockResolvedValue(true) }) },
}))
jest.mock('../booksStore', () => ({
  useBooksStore: { getState: () => ({ updateBookBalance: jest.fn().mockResolvedValue(undefined), fetchBook: jest.fn() }) },
}))

import { entriesService } from '../../services/entriesService'
import { localEntriesDb } from '../../services/localDb'
import { useEntriesStore } from '../entriesStore'

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

const row = (id: string, bookId: string) => ({
  id, book_id: bookId, user_id: 'user-1', amount: '10.00', type: 'cash_in' as const,
  note: null, entry_date: '2026-10-04T10:00:00.000Z', created_at: '2026-10-04T10:00:00.000Z', updated_at: '2026-10-04T10:00:00.000Z',
})

describe('entries store active-book consistency', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useEntriesStore.getState().reset()
  })

  it('ignores a delayed book A fetch after book B becomes active', async () => {
    const a = deferred<any>()
    const b = deferred<any>()
    ;(entriesService.getEntries as jest.Mock).mockImplementation((bookId: string) => bookId === 'book-a' ? a.promise : b.promise)
    ;(entriesService.getBookSummary as jest.Mock).mockImplementation(async (bookId: string) => ({
      data: { book_id: bookId, balance: '10.00', cash_in: '10.00', cash_out: '0.00', entry_count: 1 }, error: null,
    }))

    const requestA = useEntriesStore.getState().fetchEntries('book-a')
    await Promise.resolve()
    const requestB = useEntriesStore.getState().fetchEntries('book-b')
    await Promise.resolve()
    b.resolve({ data: [row('entry-b', 'book-b')], error: null })
    await requestB
    a.resolve({ data: [row('entry-a', 'book-a')], error: null })
    await requestA

    expect(useEntriesStore.getState().loadedBookId).toBe('book-b')
    expect(useEntriesStore.getState().entries.map(entry => entry.id)).toEqual(['entry-b'])
  })

  it('does not apply a delayed create response to the newly active book', async () => {
    const response = deferred<any>()
    ;(entriesService.createEntry as jest.Mock).mockReturnValue(response.promise)
    useEntriesStore.setState({ loadedBookId: 'book-a', entries: [], summary: { balance: '0.00', cash_in: '0.00', cash_out: '0.00', entry_count: 0 } })

    const create = useEntriesStore.getState().createEntry('book-a', {
      amount: '10.00', type: 'cash_in', note: '', entry_date: new Date('2026-10-04T10:00:00.000Z'),
    })
    await Promise.resolve()
    useEntriesStore.setState({
      loadedBookId: 'book-b', entries: [row('entry-b', 'book-b')],
      summary: { balance: '10.00', cash_in: '10.00', cash_out: '0.00', entry_count: 1 },
    })
    response.resolve({ data: row('created-a', 'book-a'), error: null })
    await create

    expect(useEntriesStore.getState().loadedBookId).toBe('book-b')
    expect(useEntriesStore.getState().entries.map(entry => entry.id)).toEqual(['entry-b'])
    expect(useEntriesStore.getState().summary?.entry_count).toBe(1)
  })

  it('updates the authoritative summary from cached prior values when realtime row is off-page', async () => {
    const previous = row('off-page-entry', 'book-a')
    ;(localEntriesDb.getByBook as jest.Mock).mockResolvedValueOnce([previous])
    useEntriesStore.setState({
      loadedBookId: 'book-a', entries: [],
      summary: { balance: '10.00', cash_in: '10.00', cash_out: '0.00', entry_count: 1 },
      summarySource: 'server',
    })

    await useEntriesStore.getState().updateEntryFromRealtime({ ...previous, amount: '5.00', type: 'cash_out' })

    expect(useEntriesStore.getState().summary).toEqual({
      cash_in: '0.00', cash_out: '5.00', balance: '-5.00', entry_count: 1,
    })
  })
})
