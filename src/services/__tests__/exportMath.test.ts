import type { Entry } from '../../types'
import { amountForExport, buildRunningBalances, compareEntriesNewestFirst } from '../exportMath'

const entry = (id: string, entry_date: string, amount: string, type: Entry['type']): Entry => ({
  id, book_id: 'book-1', user_id: 'user-1', amount, type, note: null,
  entry_date, created_at: entry_date, updated_at: entry_date,
})

describe('export money and ordering', () => {
  it('uses chronological running balances and decimal-safe arithmetic', () => {
    const entries = [
      entry('third', '2026-01-03T00:00:00.000Z', '0.05', 'cash_out'),
      entry('first', '2026-01-01T00:00:00.000Z', '0.10', 'cash_in'),
      entry('second', '2026-01-02T00:00:00.000Z', '0.20', 'cash_in'),
    ]
    const balances = buildRunningBalances(entries)
    expect(balances.get('first')).toBe('0.10')
    expect(balances.get('second')).toBe('0.30')
    expect(balances.get('third')).toBe('0.25')
    expect([...entries].sort(compareEntriesNewestFirst).map(item => item.id)).toEqual(['third', 'second', 'first'])
  })

  it('orders equal timestamps consistently and refuses malformed amounts', () => {
    const high = entry('b', '2026-01-01T00:00:00.000Z', '1.00', 'cash_in')
    const low = entry('a', '2026-01-01T00:00:00.000Z', '1.00', 'cash_in')
    expect([low, high].sort(compareEntriesNewestFirst).map(item => item.id)).toEqual(['b', 'a'])
    expect(() => amountForExport({ ...low, amount: '12abc' })).toThrow('amount is invalid')
  })
})
