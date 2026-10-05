// src/store/authStore.ts
//
import { create } from 'zustand'
import type { Profile } from '../types'
import { authService } from '../services/authService'
import { logger } from '../utils/logger'
import { useBooksStore } from './booksStore'
import { useEntriesStore } from './entriesStore'
import { useInboxStore } from './inboxStore'
import { useTodoStore } from './todoStore'

let initialization: Promise<void> | null = null
let authEventVersion = 0
const OTP_RESEND_COOLDOWN_MS = 60_000
const otpRequestTimes = new Map<string, number>()

function resetUserScopedMemory() {
  useBooksStore.getState().reset()
  useEntriesStore.getState().reset()
  useInboxStore.getState().clear()
  useTodoStore.getState().reset()
}

function isNetworkFailure(error: string): boolean {
  return /network|fetch|timeout|timed out|abort|offline|connection/i.test(error)
}

interface AuthState {
  user: Profile | null
  isLoading: boolean
  isAuthenticated: boolean
  /** Cached, identity-matched local mode. It does not authorize Supabase calls. */
  isOfflineMode: boolean
  initialize: () => Promise<void>
  resolveOnlineSession: () => Promise<void>
  sendOtp: (email: string) => Promise<{ error: string | null }>
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
  setUser: (user: Profile | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isOfflineMode: false,

  initialize: () => {
    if (initialization) return initialization
    set({ isLoading: true })
    initialization = new Promise<void>((resolve) => {
      let settled = false
      const finishInitial = () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve()
      }
      const timeout = setTimeout(() => {
        logger.warn('[Auth] Session restoration timed out; waiting state ended without trusting cached identity')
        set({ user: null, isAuthenticated: false, isOfflineMode: false, isLoading: false })
        finishInitial()
      }, 10000)

      // Subscribe before resolving startup. Supabase emits INITIAL_SESSION
      // after its persisted storage adapter has finished restoring the session.
      const { data } = authService.onAuthStateChange((event, session) => {
        if (!['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) return
        const version = ++authEventVersion

        // Never await Supabase calls from inside its auth callback: the auth
        // client serializes these callbacks with its internal lock.
        setTimeout(() => {
          void (async () => {
            if (event === 'SIGNED_OUT' || !session?.user?.id) {
              const offlineProfile = event === 'INITIAL_SESSION' || event === 'SIGNED_OUT'
                ? await authService.getOfflineCachedProfile()
                : null
              if ((event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') && offlineProfile && version === authEventVersion) {
                set({ user: offlineProfile, isAuthenticated: false, isOfflineMode: true, isLoading: false })
                finishInitial()
                return
              }
              resetUserScopedMemory()
              set({ user: null, isAuthenticated: false, isOfflineMode: false, isLoading: false })
              finishInitial()
              return
            }

            const sessionUserId = session.user.id
            const oldUserId = useAuthStore.getState().user?.id
            if (oldUserId && oldUserId !== sessionUserId) resetUserScopedMemory()
            if (event === 'INITIAL_SESSION' || oldUserId !== sessionUserId) {
              set({ user: null, isAuthenticated: false, isOfflineMode: false, isLoading: true })
            }

            const { data: profile, error } = await authService.getProfile(sessionUserId)
            if (version !== authEventVersion) return

            if (profile && profile.id === sessionUserId) {
              set({ user: profile, isAuthenticated: true, isOfflineMode: false, isLoading: false })
              finishInitial()
              return
            }

            // Offline shell is allowed only when a persisted session names the
            // same account and the server failure is clearly a transport issue.
            // It never authorizes Supabase writes or realtime subscriptions.
            const cached = error && isNetworkFailure(error)
              ? await authService.getCachedProfile(sessionUserId)
              : null
            if (version !== authEventVersion) return
            if (cached) {
              set({ user: cached, isAuthenticated: false, isOfflineMode: true, isLoading: false })
            } else {
              set({ user: null, isAuthenticated: false, isOfflineMode: false, isLoading: false })
            }
            finishInitial()
          })().catch((error) => {
            if (version !== authEventVersion) return
            logger.warn('[Auth] Failed to resolve auth event:', error)
            set({ user: null, isAuthenticated: false, isOfflineMode: false, isLoading: false })
            finishInitial()
          })
        }, 0)
      })
      void data.subscription // Keep one Supabase listener for the app lifetime.
    })
    return initialization
  },

  resolveOnlineSession: async () => {
    const version = authEventVersion
    const before = useAuthStore.getState().user?.id
    const session = await authService.getSession()
    if (version !== authEventVersion || !useAuthStore.getState().isOfflineMode) return
    if (!session?.user?.id) {
      if (before) resetUserScopedMemory()
      set({ user: null, isAuthenticated: false, isOfflineMode: false, isLoading: false })
      return
    }
    const { data: profile, error } = await authService.getProfile(session.user.id)
    if (version !== authEventVersion || !useAuthStore.getState().isOfflineMode) return
    if (profile && profile.id === session.user.id) {
      if (before && before !== profile.id) resetUserScopedMemory()
      set({ user: profile, isAuthenticated: true, isOfflineMode: false, isLoading: false })
    } else if (error && isNetworkFailure(error)) {
      const cached = await authService.getCachedProfile(session.user.id)
      if (version !== authEventVersion || !useAuthStore.getState().isOfflineMode) return
      set({ user: cached, isAuthenticated: false, isOfflineMode: !!cached, isLoading: false })
    } else {
      resetUserScopedMemory()
      set({ user: null, isAuthenticated: false, isOfflineMode: false, isLoading: false })
    }
  },

  sendOtp: async (email) => {
    const normalizedEmail = email.trim().toLowerCase()
    const lastRequest = otpRequestTimes.get(normalizedEmail)
    const remainingMs = lastRequest === undefined ? 0 : OTP_RESEND_COOLDOWN_MS - (Date.now() - lastRequest)
    if (remainingMs > 0) {
      return { error: `Please wait ${Math.ceil(remainingMs / 1000)} seconds before requesting another sign-in code.` }
    }
    const { error } = await authService.sendOtp(normalizedEmail)
    if (!error || /rate.?limit|too many requests/i.test(error)) otpRequestTimes.set(normalizedEmail, Date.now())
    return { error: error ?? null }
  },

  verifyOtp: async (email, token) => {
    const { error } = await authService.verifyOtp(email, token)
    if (!error) {
      const { data: profile } = await authService.getProfile()
      if (profile) set({ user: profile, isAuthenticated: true, isOfflineMode: false, isLoading: false })
    }
    return { error: error ?? null }
  },

  signInWithGoogle: async () => {
    const { error } = await authService.signInWithGoogle()
    return { error: error ?? null }
  },

  refreshProfile: async () => {
    try {
      const { data: profile } = await authService.getProfile()
      if (profile) set({ user: profile })
    } catch { }
  },

  signOut: async () => {
    const userId = useAuthStore.getState().user?.id
    resetUserScopedMemory()
    set({ user: null, isAuthenticated: false, isOfflineMode: false, isLoading: false })
    if (userId) await authService.clearCachedProfile(userId)
    try {
      await authService.signOut()
    } catch (error) {
      logger.warn('[Auth] Sign-out cleanup failed:', error)
    }
  },

  setUser: (user) => set({ user, isAuthenticated: !!user, isOfflineMode: false }),
}))
