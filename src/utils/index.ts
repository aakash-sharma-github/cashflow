// src/utils/index.ts
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns'

/**
 * Format currency amount
 */
export function formatAmount(amount: number, currency = 'USD'): string {
  const currencySymbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', INR: '₹',
    AED: 'د.إ', SAR: '﷼', PKR: '₨', BDT: '৳',
  }
  const symbol = currencySymbols[currency] || currency
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${symbol}${formatted}`
}

/**
 * Format date for display in entry list
 */
export function formatEntryDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (isToday(date)) return `Today, ${format(date, 'h:mm a')}`
  if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`
  return format(date, 'MMM d, yyyy')
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
}

/**
 * Format date for entry date picker display
 */
export function formatDateForDisplay(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMM d, yyyy')
}

/**
 * Get initials from name or email
 */
export function getInitials(nameOrEmail: string): string {
  if (!nameOrEmail) return '?'
  const parts = nameOrEmail.trim().split(/[\s@]+/)
  if (parts.length >= 2 && !nameOrEmail.includes('@')) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return nameOrEmail[0].toUpperCase()
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/**
 * Validate amount input
 */
export function isValidAmount(value: string): boolean {
  if (!value) return false
  const num = parseFloat(value)
  return !isNaN(num) && num > 0 && num < 1_000_000_000
}

/**
 * Truncate text with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * Generate a random ID (for optimistic updates)
 */
export function generateTempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Get display name from profile
 */
export function getDisplayName(profile?: { full_name?: string | null; email?: string }): string {
  if (!profile) return 'Unknown'
  return profile.full_name || profile.email || 'Unknown'
}
