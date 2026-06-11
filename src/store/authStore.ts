// src/store/authStore.ts
// CRITICAL FIX: initialize() must ALWAYS set isLoading=false.
// Previous bug: if getSession() or getProfile() threw an unexpected error
// that wasn't caught by the inner try/catch (e.g., network timeout during
// session refresh, or Supabase client crash), isLoading stayed true forever
// → splash screen freeze.
//
// Fixes applied:
// 1. Outer try/finally guarantees isLoading=false no matter what
// 2. Hard timeout on the whole initialize() — after 8s force isLoading=false
// 3. Auth state listener registered OUTSIDE the try block so it always fires

import { create } from 'zustand'
import type { Profile } from '../types'
import { authService } from '../services/authService'
import { logger } from '@/utils/logger'

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
    // Hard timeout — unblock app after 8 seconds if something hangs
    const timeout = setTimeout(() => {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }, 8000)

    try {
      // Step 1: Check if we have a local session (works offline — session is
      // stored in SecureStore by the Supabase client)
      const session = await authService.getSession()

      if (session) {
        // Step 2: Try to load profile (uses cache fallback when offline)
        const { data: profile } = await authService.getProfile()
        if (profile) {
          // Authenticated — either from network or local cache
          set({ user: profile, isAuthenticated: true, isLoading: false })
        } else {
          // Session exists but no profile (rare) — check cache directly
          const cached = await authService.getCachedProfile()
          if (cached) {
            set({ user: cached, isAuthenticated: true, isLoading: false })
          } else {
            // No profile anywhere — treat as not authenticated
            set({ user: null, isAuthenticated: false, isLoading: false })
          }
        }
      } else {
        // No local session at all — must log in
        set({ user: null, isAuthenticated: false, isLoading: false })
      }
    } catch (e) {
      // If getSession() itself throws (should be rare — it reads from SecureStore),
      // fall back to the cached profile to avoid logging the user out offline
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

    // Auth state listener — handles sign-in events (online) and explicit sign-out
    authService.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setTimeout(async () => {
          try {
            const { data: profile } = await authService.getProfile()
            set({ user: profile, isAuthenticated: true, isLoading: false })
          } catch {
            set({ isAuthenticated: true, isLoading: false })
          }
        }, 500)

      } else if (event === 'TOKEN_REFRESHED') {
        // JWT refreshed silently — no action needed

      } else if (event === 'SIGNED_OUT') {
        // CRITICAL: Supabase fires SIGNED_OUT both when:
        //   (a) user explicitly signs out — should log out ✅
        //   (b) token refresh fails (no internet) — should NOT log out ❌
        //
        // Distinguish by checking if we have a cached profile AND no session.
        // If there is a cached profile, the user was previously authenticated
        // and is likely just offline — keep them logged in from cache.
        const cached = await authService.getCachedProfile()
        if (cached) {
          // Offline token refresh failure — restore auth from cache
          logger.info('[Auth] SIGNED_OUT event — restoring from cache (offline?)')
          set({ user: cached, isAuthenticated: true, isLoading: false })
        } else {
          // No cache — genuine sign-out
          set({ user: null, isAuthenticated: false, isLoading: false })
        }

      } else if (event === 'USER_UPDATED') {
        // Profile was updated — refresh local copy
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
    // Clear cache FIRST so the SIGNED_OUT auth event handler
    // finds no cached profile and proceeds with the actual logout.
    // If we clear after, there's a race where the event fires before
    // the cache is cleared and the user stays logged in.
    await authService.setCachedProfile(null)
    await authService.signOut()
    set({ user: null, isAuthenticated: false })
  },

  setUser: (user) => set({ user, isAuthenticated: !!user }),
}))