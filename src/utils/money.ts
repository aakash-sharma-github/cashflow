/** Exact helpers for the database's numeric(12,2) entry amounts. */
export type MoneyValue = number | string

const MAX_ENTRY_CENTS = 999_999_999_999n

function decimalToCents(value: MoneyValue): bigint | null {
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  const raw = String(value).trim()
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw)
  if (!match) return null
  const whole = BigInt(match[2])
  const fraction = BigInt((match[3] ?? '').padEnd(2, '0') || '0')
  const cents = whole * 100n + fraction
  return match[1] ? -cents : cents
}

export function normalizeEntryAmount(value: MoneyValue): string | null {
  const raw = String(value).trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null
  const cents = decimalToCents(raw)
  if (cents === null || cents <= 0n || cents > MAX_ENTRY_CENTS) return null
  return centsToDecimal(cents)
}

export function isValidAmount(value: string): boolean {
  return normalizeEntryAmount(value) !== null
}

export function centsToDecimal(cents: bigint): string {
  const sign = cents < 0n ? '-' : ''
  const absolute = cents < 0n ? -cents : cents
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}

export function addMoney(left: MoneyValue, right: MoneyValue): string {
  const a = decimalToCents(left)
  const b = decimalToCents(right)
  if (a === null || b === null) return '0.00'
  return centsToDecimal(a + b)
}

export function subtractMoney(left: MoneyValue, right: MoneyValue): string {
  const a = decimalToCents(left)
  const b = decimalToCents(right)
  if (a === null || b === null) return '0.00'
  return centsToDecimal(a - b)
}

export function sumMoney(values: MoneyValue[]): string {
  return values.reduce<string>((sum, value) => addMoney(sum, value), '0.00')
}

export function compareMoney(left: MoneyValue, right: MoneyValue = 0): number {
  const a = decimalToCents(left) ?? 0n
  const b = decimalToCents(right) ?? 0n
  return a < b ? -1 : a > b ? 1 : 0
}

export function formatMoney(value: MoneyValue, currency = 'USD'): string {
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', INR: '₹', AED: 'د.إ', SAR: '﷼', NPR: 'रु', BDT: '৳',
  }
  const symbol = symbols[currency] || currency
  const cents = decimalToCents(value) ?? 0n
  const negative = cents < 0n
  const absolute = negative ? -cents : cents
  const whole = (absolute / 100n).toLocaleString('en-US')
  const fraction = absolute % 100n
  const decimal = fraction === 0n ? '' : fraction % 10n === 0n ? `.${fraction / 10n}` : `.${String(fraction).padStart(2, '0')}`
  return `${negative ? '-' : ''}${symbol}${whole}${decimal}`
}
