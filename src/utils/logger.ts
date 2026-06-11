// src/utils/logger.ts
// Production-safe logger.
//
// In development (__DEV__ = true):  all output visible in ADB / Metro
// In production  (__DEV__ = false): completely silent — zero overhead
//
// Usage:
//   import { logger } from '../utils/logger'
//   logger.info('[Auth] User signed in')
//   logger.warn('[Sync] Retry attempt')
//   logger.error('[Push] Failed to schedule:', e)

const noop = () => { }

export const logger = __DEV__
    ? {
        info: (...args: any[]) => console.log(...args),
        warn: (...args: any[]) => console.warn(...args),
        error: (...args: any[]) => console.error(...args),
    }
    : {
        info: noop,
        warn: noop,
        error: noop,
    }