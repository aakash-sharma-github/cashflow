// src/store/authStore.ts
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
    try {
      const session = await authService.getSession()
      if (session) {
        const { data: profile } = await authService.getProfile()
        set({ user: profile, isAuthenticated: !!profile, isLoading: false })
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false })
      }
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }

    // Auth state listener — handles navigation after Google OAuth browser returns
    authService.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Small delay to ensure profile record exists (trigger may be async)
        setTimeout(async () => {
          const { data: profile } = await authService.getProfile()
          set({ user: profile, isAuthenticated: true, isLoading: false })
        }, 500)
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, isAuthenticated: false, isLoading: false })
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

  /**
   * Google sign-in: the authService opens the browser and waits.
   * On success, the SIGNED_IN event fires from onAuthStateChange above,
   * which fetches the profile and sets isAuthenticated — navigating the app.
   * The LoginScreen uses a finally block to always reset its loading state.
   */
  signInWithGoogle: async () => {
    const { error } = await authService.signInWithGoogle()
    // Don't call getProfile() here — onAuthStateChange handles it.
    // Just pass the error signal back to the button.
    return { error: error ?? null }
  },

  refreshProfile: async () => {
    const { data: profile } = await authService.getProfile()
    if (profile) set({ user: profile })
  },

  signOut: async () => {
    await authService.signOut()
    set({ user: null, isAuthenticated: false })
  },

  setUser: (user) => set({ user, isAuthenticated: !!user }),
}))