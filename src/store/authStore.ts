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
    // Hard timeout — if everything hangs, unblock the app after 8 seconds
    const timeout = setTimeout(() => {
      console.warn('[Auth] initialize() timed out — forcing isLoading=false')
      set({ user: null, isAuthenticated: false, isLoading: false })
    }, 8000)

    try {
      const session = await authService.getSession()
      if (session) {
        const { data: profile } = await authService.getProfile()
        set({ user: profile, isAuthenticated: !!profile, isLoading: false })
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false })
      }
    } catch (e) {
      console.warn('[Auth] initialize error:', e)
      set({ user: null, isAuthenticated: false, isLoading: false })
    } finally {
      clearTimeout(timeout)
    }

    // Auth state listener — registered after initial load, always active
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
      } else if (event === 'SIGNED_OUT') {
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