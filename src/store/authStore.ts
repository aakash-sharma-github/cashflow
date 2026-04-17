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
            // Online sign-in but profile fetch failed — keep authenticated
            set({ isAuthenticated: true, isLoading: false })
          }
        }, 500)
      } else if (event === 'SIGNED_OUT') {
        // Only log out on EXPLICIT sign-out — not on network loss
        set({ user: null, isAuthenticated: false, isLoading: false })
      } else if (event === 'TOKEN_REFRESHED') {
        // Silently refresh — no navigation change needed
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
    await authService.signOut()
    set({ user: null, isAuthenticated: false })
  },

  setUser: (user) => set({ user, isAuthenticated: !!user }),
}))