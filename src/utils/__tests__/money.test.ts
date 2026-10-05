import { addMoney, compareMoney, formatMoney, isValidAmount, normalizeEntryAmount, subtractMoney, sumMoney } from '../money'

describe('numeric(12,2) money handling', () => {
  it.each([
    ['1', '1.00'],
    [' 12.5 ', '12.50'],
    ['9999999999.99', '9999999999.99'],
  ])('normalizes valid positive amounts (%s)', (input, expected) => {
    expect(normalizeEntryAmount(input)).toBe(expected)
  })

  it.each(['', ' ', '0', '0.00', '-1', '+1', '.50', '1.', '1.001', '12abc', '1,000', '10000000000'])('rejects invalid entry amounts (%s)', (input) => {
    expect(normalizeEntryAmount(input)).toBeNull()
    expect(isValidAmount(input)).toBe(false)
  })

  it('adds and subtracts cents without floating point drift', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30')
    expect(sumMoney(['0.10', '0.20', '0.30'])).toBe('0.60')
    expect(subtractMoney('10.00', '11.20')).toBe('-1.20')
    expect(compareMoney('-0.01')).toBe(-1)
  })

  it('formats negative signs and large values without converting totals to Number', () => {
    expect(formatMoney('-12345678901234567890.25')).toBe('-$12,345,678,901,234,567,890.25')
    expect(formatMoney('1.50', 'EUR')).toBe('€1.50')
  })

  it('adds grouping, omits zero cents, and preserves meaningful cents', () => {
    expect(formatMoney('1000')).toBe('$1,000')
    expect(formatMoney('1000.00')).toBe('$1,000')
    expect(formatMoney('1000.50')).toBe('$1,000.50')
    expect(formatMoney('10000.99')).toBe('$10,000.99')
    expect(formatMoney('-1000')).toBe('-$1,000')
    expect(formatMoney('-10000.99')).toBe('-$10,000.99')
    expect(formatMoney('0')).toBe('$0')
  })
})
