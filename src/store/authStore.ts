// src/store/authStore.ts
//
// OFFLINE AUTH STRATEGY:
//
// Problem: Supabase JWTs expire after 1 hour. When the app is opened after
// being offline for hours, supabase.auth.getSession() tries to refresh the JWT.
// With no internet, the refresh fails and getSession() returns null — not an
// error, just null. The previous code saw null and logged the user out.
//
// Fix: A three-layer fallback in initialize():
//   Layer 1: getSession() succeeds (JWT valid or refresh worked) → normal flow
//   Layer 2: getSession() returns null BUT we have a cached profile → stay logged in
//   Layer 3: getSession() throws → catch block checks cache → stay logged in
//
// The cached profile is written to AsyncStorage on every successful login and
// profile refresh. AsyncStorage survives app restarts and never expires.
// The user is only truly logged out when they explicitly tap Sign Out, which
// clears the cache first.
//
// This means: as long as the user has signed in at least once, they will
// NEVER be logged out by lack of internet, regardless of how long the JWT
// has been expired or how long the phone has been offline.

import { create } from 'zustand'
import type { Profile } from '../types'
import { authService } from '../services/authService'
import { logger } from '../utils/logger'

interface AuthState {
  user: Profile | null
  isLoading: boolean
  isAuthenticated: boolean
  initialize: () => Promise<void>
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

  initialize: async () => {
    // Hard timeout — never block the app longer than 8 seconds on startup
    const timeout = setTimeout(() => {
      // On timeout, try to recover from cache before giving up
      authService.getCachedProfile().then(cached => {
        if (cached) {
          set({ user: cached, isAuthenticated: true, isLoading: false })
        } else {
          set({ user: null, isAuthenticated: false, isLoading: false })
        }
      }).catch(() => {
        set({ user: null, isAuthenticated: false, isLoading: false })
      })
    }, 8000)

    try {
      // ── Layer 1: Try to get a valid session (reads from SecureStore,
      // attempts token refresh if JWT expired) ────────────────────────
      const session = await authService.getSession()

      if (session) {
        // Session is valid — try to load profile from network or cache
        const { data: profile } = await authService.getProfile()
        if (profile) {
          set({ user: profile, isAuthenticated: true, isLoading: false })
        } else {
          // Profile fetch failed but session is valid — use cache
          const cached = await authService.getCachedProfile()
          if (cached) {
            set({ user: cached, isAuthenticated: true, isLoading: false })
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false })
          }
        }

      } else {
        // ── Layer 2: getSession() returned null
        // This happens when:
        //   (a) JWT expired AND no internet for refresh — user is offline
        //   (b) ChunkedSecureStore read is still in progress (race condition)
        //
        // For (b): retry getSession() after 800ms to let SecureStore finish
        // For (a): fall back to cached profile

        // Retry once — solves the race condition where SecureStore
        // hasn't finished loading by the time getSession() is first called
        await new Promise(r => setTimeout(r, 800))
        const retrySession = await authService.getSession()

        if (retrySession) {
          // SecureStore just needed more time — session is now valid
          logger.info('[Auth] Session loaded on retry (SecureStore was still reading)')
          const { data: profile } = await authService.getProfile()
          if (profile) {
            set({ user: profile, isAuthenticated: true, isLoading: false })
          } else {
            const cached = await authService.getCachedProfile()
            set({ user: cached, isAuthenticated: !!cached, isLoading: false })
          }
        } else {
          // Genuinely no session — check cache for offline recovery
          const cached = await authService.getCachedProfile()
          if (cached) {
            logger.info('[Auth] No session (offline/expired) — restoring from cached profile')
            // NOTE: The Supabase client will NOT have a valid JWT in this state.
            // API calls will fail with "Not authenticated" until connectivity
            // is restored and the client can refresh the token.
            // booksStore and entriesStore handle this gracefully by showing
            // cached local data when network calls fail.
            set({ user: cached, isAuthenticated: true, isLoading: false })
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false })
          }
        }
      }

    } catch (e) {
      // ── Layer 3: getSession() itself threw — SecureStore locked or crashed
      // Still try the cache before logging out
      logger.warn('[Auth] initialize() error — falling back to cache:', e)
      try {
        const cached = await authService.getCachedProfile()
        if (cached) {
          set({ user: cached, isAuthenticated: true, isLoading: false })
        } else {
          set({ user: null, isAuthenticated: false, isLoading: false })
        }
      } catch {
        set({ user: null, isAuthenticated: false, isLoading: false })
      }
    } finally {
      clearTimeout(timeout)
    }

    // ── Auth state listener ─────────────────────────────────────────
    // Handles events AFTER initialization (sign-in, token refresh, sign-out)
    authService.onAuthStateChange(async (event, session) => {

      if (event === 'SIGNED_IN' && session) {
        // Fresh sign-in — load profile from network and cache it
        setTimeout(async () => {
          try {
            const { data: profile } = await authService.getProfile()
            if (profile) set({ user: profile, isAuthenticated: true, isLoading: false })
          } catch {
            set({ isAuthenticated: true, isLoading: false })
          }
        }, 500)

      } else if (event === 'TOKEN_REFRESHED') {
        // JWT silently refreshed — no UI change needed
        logger.info('[Auth] Token refreshed silently')

      } else if (event === 'SIGNED_OUT') {
        // Supabase fires SIGNED_OUT for TWO different reasons:
        //   (a) Explicit signOut() call — user tapped Sign Out → SHOULD log out
        //   (b) Token refresh failed while app was backgrounded → should NOT log out
        //
        // We distinguish them by checking the profile cache:
        //   - signOut() clears the cache BEFORE calling supabase.auth.signOut()
        //     so by the time this event fires, getCachedProfile() returns null → log out
        //   - Token refresh failure leaves the cache intact → restore from cache
        const cached = await authService.getCachedProfile()
        if (cached) {
          logger.info('[Auth] SIGNED_OUT (token refresh failure) — restoring from cache')
          set({ user: cached, isAuthenticated: true, isLoading: false })
        } else {
          // Cache was cleared by explicit signOut() — proceed with logout
          set({ user: null, isAuthenticated: false, isLoading: false })
        }

      } else if (event === 'USER_UPDATED') {
        try {
          const { data: profile } = await authService.getProfile()
          if (profile) set({ user: profile })
        } catch { }
      }
    })
  },

  sendOtp: async (email) => {
    const { error } = await authService.sendOtp(email)
    return { error: error ?? null }
  },

  verifyOtp: async (email, token) => {
    const { error } = await authService.verifyOtp(email, token)
    if (!error) {
      const { data: profile } = await authService.getProfile()
      set({ user: profile, isAuthenticated: true })
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
    // MUST clear cache BEFORE calling supabase.auth.signOut()
    // The SIGNED_OUT event fires ~immediately after signOut() is called.
    // If we clear cache after, there's a race where the listener sees the
    // cache and thinks it's an offline scenario — keeping the user logged in.
    await authService.setCachedProfile(null)
    await authService.signOut()
    set({ user: null, isAuthenticated: false })
  },

  setUser: (user) => set({ user, isAuthenticated: !!user }),
}))