import type { Entry } from '../types'
import { addMoney, normalizeEntryAmount, subtractMoney } from '../utils/money'

export function amountForExport(entry: Entry): string {
  const amount = normalizeEntryAmount(entry.amount)
  if (!amount) throw new Error(`Cannot export entry ${entry.id}: its amount is invalid`)
  return amount
}

export function compareEntriesNewestFirst(a: Entry, b: Entry): number {
  const byDate = new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
  return byDate || b.id.localeCompare(a.id)
}

/** Running balances are calculated oldest-first, independently of display order. */
export function buildRunningBalances(entries: Entry[]): Map<string, string> {
  const chronological = [...entries].sort((a, b) => {
    const byDate = new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime()
    return byDate || a.id.localeCompare(b.id)
  })
  const balances = new Map<string, string>()
  let balance = '0.00'

  for (const entry of chronological) {
    const amount = amountForExport(entry)
    balance = entry.type === 'cash_in' ? addMoney(balance, amount) : subtractMoney(balance, amount)
    balances.set(entry.id, balance)
  }

  return balances
}
