// src/constants/index.ts  — Design System v2

export const COLORS = {
  // Brand
  primary: '#5B5FED',
  primaryDark: '#4347D9',
  primaryLight: '#EEEFFE',
  primaryGlow: 'rgba(91,95,237,0.15)',

  // Semantic
  cashIn: '#00C48C',
  cashInLight: '#E6FBF4',
  cashInDark: '#00A374',

  cashOut: '#FF647C',
  cashOutLight: '#FFF0F2',
  cashOutDark: '#E84560',

  // Priority / status aliases
  danger: '#FF647C',  // alias for cashOut - used for error/high-priority UI
  warning: '#F59E0B',  // amber - medium priority
  success: '#00C48C',  // alias for cashIn - used for success/low-priority UI

  // Surfaces
  background: '#F5F7FF',
  surface: '#FFFFFF',
  surfaceSecondary: '#F0F2FF',
  surfaceElevated: '#FFFFFF',

  // Text
  text: '#0D0F1C',
  textSecondary: '#6B7280',
  textTertiary: '#A0A8BA',
  textInverse: '#FFFFFF',

  // Borders
  border: '#E8EAF6',
  borderDark: '#D1D5F0',

  // Status
  error: '#FF647C',
  info: '#5B5FED',

  overlay: 'rgba(13,15,28,0.55)',
} as const

export const BOOK_COLORS = [
  '#5B5FED', '#7C3AED', '#DB2777', '#DC2626',
  '#D97706', '#059669', '#0891B2', '#2563EB',
  '#65A30D', '#EA580C',
] as const

export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'NPR', symbol: 'रु', name: 'Nepali Rupee' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
] as const

export const SPACING = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48,
} as const

export const BORDER_RADIUS = {
  sm: 8, md: 12, lg: 18, xl: 24, '2xl': 32, full: 9999,
} as const

export const FONT_SIZE = {
  xs: 11, sm: 13, md: 15, lg: 17, xl: 20,
  '2xl': 24, '3xl': 30, '4xl': 38,
} as const

export const SHADOW = {
  sm: {
    shadowColor: '#5B5FED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#5B5FED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 5,
  },
  lg: {
    shadowColor: '#5B5FED',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 10,
  },
  colored: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  }),
} as const

export const PAGE_SIZE = 30