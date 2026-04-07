// src/store/authStore.ts
import { create } from 'zustand'
import type { Profile } from '../types'
import { authService } from '../services/authService'

interface AuthState {
  user: Profile | null
  isLoading: boolean
  isAuthenticated: boolean

  // Actions
  initialize: () => Promise<void>
  sendOtp: (email: string) => Promise<{ error: string | null }>
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
  setUser: (user: Profile | null) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: async () => {
    try {
      const session = await authService.getSession()
      if (session) {
        const { data: profile } = await authService.getProfile()
        set({ user: profile, isAuthenticated: true, isLoading: false })
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false })
      }
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }

    // Listen for future auth changes
    authService.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const { data: profile } = await authService.getProfile()
        set({ user: profile, isAuthenticated: true })
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, isAuthenticated: false })
      }
    })
  },

  sendOtp: async (email) => {
    const { error } = await authService.sendOtp(email)
    return { error }
  },

  verifyOtp: async (email, token) => {
    const { error } = await authService.verifyOtp(email, token)
    if (!error) {
      const { data: profile } = await authService.getProfile()
      set({ user: profile, isAuthenticated: true })
    }
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
