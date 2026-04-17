// src/services/authService.ts
// Offline-resilient auth: user profile is cached in AsyncStorage so the
// app stays authenticated when the device is offline. Cache is updated on
// every successful network fetch and cleared on sign-out.
import supabase from './supabase'
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Profile, ApiResponse } from '../types'

WebBrowser.maybeCompleteAuthSession()

const PROFILE_CACHE_KEY = 'cashflow:cached_profile'

export const authService = {
  // ── Profile cache ──────────────────────────────────────────
  async getCachedProfile(): Promise<Profile | null> {
    try {
      const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  },

  async setCachedProfile(profile: Profile | null): Promise<void> {
    try {
      if (profile) {
        await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
      } else {
        await AsyncStorage.removeItem(PROFILE_CACHE_KEY)
      }
    } catch { }
  },

  // ── OTP auth ───────────────────────────────────────────────
  async sendOtp(email: string): Promise<ApiResponse<null>> {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: 'cashflow://auth/callback' },
    })
    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  },

  async verifyOtp(email: string, token: string): Promise<ApiResponse<null>> {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  },

  // ── Google OAuth ───────────────────────────────────────────
  async signInWithGoogle(): Promise<ApiResponse<null>> {
    try {
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: 'cashflow',
        path: 'auth/callback',
      })

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      })

      if (error) return { data: null, error: error.message }
      if (!data?.url) return { data: null, error: 'No OAuth URL returned from Supabase' }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
        showInRecents: true,
      })

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { data: null, error: 'cancelled' }
      }
      if (result.type !== 'success' || !result.url) {
        return { data: null, error: 'Authentication was not completed' }
      }

      const url = new URL(result.url)
      const code = url.searchParams.get('code')
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) return { data: null, error: exchangeError.message }
        return { data: null, error: null }
      }

      const hash = url.hash?.replace('#', '')
      if (hash) {
        const hashParams = new URLSearchParams(hash)
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken, refresh_token: refreshToken,
          })
          if (sessionError) return { data: null, error: sessionError.message }
          return { data: null, error: null }
        }
      }
      return { data: null, error: 'Could not extract session from callback.' }
    } catch (e: any) {
      return { data: null, error: e?.message || 'Google sign-in failed' }
    }
  },

  // ── Session / Profile ──────────────────────────────────────
  async getSession() {
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) return null
      return data.session
    } catch { return null }
  },

  // Fetches profile from network; falls back to cache when offline
  async getProfile(): Promise<ApiResponse<Profile>> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { data: null, error: 'Not authenticated' }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        // Network failure — try the cached profile
        const cached = await authService.getCachedProfile()
        if (cached && cached.id === user.id) {
          return { data: cached, error: null }
        }
        return { data: null, error: error.message }
      }

      // Success — update cache with fresh data
      await authService.setCachedProfile(data)
      return { data, error: null }
    } catch {
      // Offline entirely — supabase.auth.getUser() may throw
      // Try to load the session from local storage and use cached profile
      const cached = await authService.getCachedProfile()
      if (cached) return { data: cached, error: null }
      return { data: null, error: 'Offline and no cached profile' }
    }
  },

  async updateProfile(updates: Partial<Pick<Profile, 'full_name' | 'push_token'>>): Promise<ApiResponse<Profile>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }
    const { data, error } = await supabase
      .from('profiles').update(updates).eq('id', user.id).select().single()
    if (error) return { data: null, error: error.message }
    // Update cache with new name/token
    await authService.setCachedProfile(data)
    return { data, error: null }
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut()
    // Clear profile cache on explicit sign-out
    await authService.setCachedProfile(null)
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback)
  },
}