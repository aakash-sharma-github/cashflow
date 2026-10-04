// src/services/authService.ts
// Offline-resilient auth: user profile is cached in AsyncStorage so the
// app stays authenticated when the device is offline. Cache is updated on
// every successful network fetch and cleared on sign-out.
import supabase from './supabase'
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import type { Profile, ApiResponse } from '../types'
import { logger } from '@/utils/logger'

WebBrowser.maybeCompleteAuthSession()

const PROFILE_CACHE_PREFIX = 'cashflow:cached_profile:'
const LEGACY_PROFILE_CACHE_KEY = 'cashflow:cached_profile'
const LAST_USER_ID_KEY = 'cashflow:last_profile_user_id'
const isTransportError = (message: string) => /network|fetch|timeout|timed out|abort|offline|connection/i.test(message)
const clientProfile = (profile: Profile): Profile => ({
  id: profile.id,
  email: profile.email,
  full_name: profile.full_name ?? null,
  avatar_url: profile.avatar_url ?? null,
})

export const authService = {
  // ── Profile cache ──────────────────────────────────────────
  async getCachedProfile(userId: string): Promise<Profile | null> {
    try {
      let raw = await AsyncStorage.getItem(`${PROFILE_CACHE_PREFIX}${userId}`)
      if (!raw) {
        const legacy = await AsyncStorage.getItem(LEGACY_PROFILE_CACHE_KEY)
        const legacyProfile = legacy ? JSON.parse(legacy) as Profile : null
        if (legacyProfile?.id === userId) {
          await authService.setCachedProfile(legacyProfile)
          raw = JSON.stringify(legacyProfile)
        }
      }
      const profile = raw ? JSON.parse(raw) as Profile : null
      return profile?.id === userId ? clientProfile(profile) : null
    } catch { return null }
  },

  async setCachedProfile(profile: Profile | null): Promise<void> {
    try {
      if (profile) {
        const safeProfile = clientProfile(profile)
        await AsyncStorage.setItem(`${PROFILE_CACHE_PREFIX}${profile.id}`, JSON.stringify(safeProfile))
        await AsyncStorage.setItem(LAST_USER_ID_KEY, profile.id)
      } else {
        await AsyncStorage.removeItem(LEGACY_PROFILE_CACHE_KEY)
      }
    } catch { }
  },

  async clearCachedProfile(userId: string): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        `${PROFILE_CACHE_PREFIX}${userId}`,
        LEGACY_PROFILE_CACHE_KEY,
      ])
      if (await AsyncStorage.getItem(LAST_USER_ID_KEY) === userId) await AsyncStorage.removeItem(LAST_USER_ID_KEY)
    } catch { }
  },

  async getOfflineCachedProfile(): Promise<Profile | null> {
    try {
      const state = await NetInfo.fetch()
      if (state.isConnected !== false && state.isInternetReachable !== false) return null
      let userId = await AsyncStorage.getItem(LAST_USER_ID_KEY)
      if (!userId) {
        const raw = await AsyncStorage.getItem(LEGACY_PROFILE_CACHE_KEY)
        const legacy = raw ? JSON.parse(raw) as Profile : null
        if (legacy?.id) {
          await authService.setCachedProfile(legacy)
          userId = legacy.id
        }
      }
      return userId ? authService.getCachedProfile(userId) : null
    } catch { return null }
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
  async getProfile(expectedUserId?: string): Promise<ApiResponse<Profile>> {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) return { data: null, error: authError.message }
      if (!user) return { data: null, error: 'Not authenticated' }
      if (expectedUserId && user.id !== expectedUserId) {
        return { data: null, error: 'Authenticated account changed during profile loading' }
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id,email,full_name,avatar_url')
        .eq('id', user.id)
        .single()

      if (error) {
        if (isTransportError(error.message)) {
          const cached = await authService.getCachedProfile(user.id)
          if (cached) return { data: null, error: error.message }
        }
        return { data: null, error: error.message }
      }

      // Sync avatar_url from Google OAuth metadata on every login.
      // Google provides it in user_metadata.avatar_url or user_metadata.picture.
      // We always update so the photo stays current if the user changes it.
      const googleAvatar =
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        null

      if (googleAvatar && googleAvatar !== data.avatar_url) {
        // Write back to profiles table so it persists and stays current
        await supabase
          .from('profiles')
          .update({ avatar_url: googleAvatar })
          .eq('id', user.id)
        data.avatar_url = googleAvatar
      }

      await authService.setCachedProfile(data)
      return { data, error: null }
    } catch (e: any) {
      return { data: null, error: e?.message || 'Unable to verify the authenticated profile' }
    }
  },

  async updateProfile(updates: Partial<Pick<Profile, 'full_name'>>): Promise<ApiResponse<Profile>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select('id,email,full_name,avatar_url')
      .single()

    if (error) {
      logger.error('[Auth] updateProfile error:', error.message)
      return { data: null, error: error.message }
    }

    await authService.setCachedProfile(data)
    return { data, error: null }
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw error
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback)
  },
}
