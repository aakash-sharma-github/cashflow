const mockPendingQueue: any[] = []

jest.mock('../supabase', () => ({
  __esModule: true,
  default: { auth: { getUser: jest.fn() }, from: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}))
jest.mock('../../store/offlineStore', () => ({
  useOfflineStore: { getState: () => ({ pendingQueue: mockPendingQueue }) },
}))

import supabase from '../supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { entriesService } from '../entriesService'

const entry = (id: string) => ({ id, book_id: 'book-1', user_id: 'user-1', amount: '0.10', type: 'cash_in' })

function configurePages(total: number, failAt?: number, authoritativeTotal = total) {
  jest.spyOn(entriesService, 'getBookSummary').mockResolvedValue({
    data: { entry_count: authoritativeTotal }, error: null,
  } as any)
  const requestedRanges: number[][] = []
  ;(supabase.from as jest.Mock).mockImplementation(() => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      range: (start: number, end: number) => {
        requestedRanges.push([start, end])
        builder.start = start
        builder.end = end
        return builder
      },
      then: (resolve: (value: any) => void, reject: (reason: any) => void) => {
        if (builder.start === failAt) return Promise.resolve({ data: null, error: { message: 'network unavailable' } }).then(resolve, reject)
        const rows = Array.from({ length: Math.max(0, Math.min(builder.end - builder.start + 1, total - builder.start)) }, (_, index) => entry(`entry-${builder.start + index}`))
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
      },
    }
    return builder
  })
  return requestedRanges
}

describe('complete server exports', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPendingQueue.splice(0)
    ;(supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  })

  it('retrieves every page beyond 5,000 entries', async () => {
    const ranges = configurePages(5001)
    const result = await entriesService.getAllEntries('book-1')
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(5001)
    expect(ranges).toEqual(Array.from({ length: 11 }, (_, page) => [page * 500, page * 500 + 499]))
  })

  it('checks the next page at exact page boundaries and preserves genuine empty results', async () => {
    const exactlyOnePage = configurePages(500)
    const result = await entriesService.getAllEntries('book-1')
    expect(result.data).toHaveLength(500)
    expect(exactlyOnePage).toHaveLength(2)

    jest.clearAllMocks()
    ;(supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    configurePages(0)
    const empty = await entriesService.getAllEntries('book-1')
    expect(empty).toEqual({ data: [], error: null })
  })

  it('returns a short single page without requesting unnecessary pages', async () => {
    const ranges = configurePages(17)
    const result = await entriesService.getAllEntries('book-1')
    expect(result.data).toHaveLength(17)
    expect(ranges).toEqual([[0, 499]])
  })

  it('returns an explicit error on a later-page failure and never substitutes cached data', async () => {
    configurePages(1200, 500)
    const result = await entriesService.getAllEntries('book-1')
    expect(result.data).toBeNull()
    expect(result.error).toContain('page 2')
    expect(AsyncStorage.getItem).not.toHaveBeenCalled()
  })

  it('rejects a short response when the authoritative server total is larger', async () => {
    configurePages(0, undefined, 2)
    const result = await entriesService.getAllEntries('book-1')
    expect(result.data).toBeNull()
    expect(result.error).toContain('server reports 2 matching entries')
  })

  it('requires queued entry mutations to sync before export', async () => {
    mockPendingQueue.push({ type: 'UPDATE_ENTRY', userId: 'user-1', payload: { bookId: 'book-1' } })
    const result = await entriesService.getAllEntries('book-1')
    expect(result.data).toBeNull()
    expect(result.error).toContain('sync pending changes')
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
