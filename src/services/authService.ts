// src/services/authService.ts
import supabase from './supabase'
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import type { Profile, ApiResponse } from '../types'

// Required for expo-auth-session to work correctly on Android
WebBrowser.maybeCompleteAuthSession()

export const authService = {
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

  /**
   * Google OAuth via expo-web-browser.
   *
   * Fix for infinite loading: the previous implementation called getProfile()
   * after signInWithGoogle() returned, but onAuthStateChange fires FIRST
   * (during the await), causing a race where isAuthenticated flips to true
   * while the button is still waiting. The loading state then gets stuck
   * if the component unmounts before setGoogleLoading(false) runs.
   *
   * Fix: return a clear success/error signal. Let the auth state listener
   * in authStore handle profile fetching and navigation. The LoginScreen
   * always resets its loading state in a finally block.
   */
  async signInWithGoogle(): Promise<ApiResponse<null>> {
    try {
      // Build redirect URI — must match what's registered in Supabase Dashboard
      // For Expo Go (dev): exp://YOUR_IP:8081
      // For production: cashflow://
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

      // Open the browser and wait for the redirect
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
        showInRecents: true,
      })

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { data: null, error: 'cancelled' }
      }

      if (result.type !== 'success' || !result.url) {
        return { data: null, error: 'Authentication was not completed' }
      }

      const callbackUrl = result.url

      // --- Try PKCE code exchange first (Supabase default flow) ---
      const url = new URL(callbackUrl)
      const code = url.searchParams.get('code')
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) return { data: null, error: exchangeError.message }
        return { data: null, error: null }
      }

      // --- Fallback: implicit flow (hash tokens) ---
      const hash = url.hash?.replace('#', '')
      if (hash) {
        const hashParams = new URLSearchParams(hash)
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (sessionError) return { data: null, error: sessionError.message }
          return { data: null, error: null }
        }
      }

      return { data: null, error: 'Could not extract session from callback. Check Supabase redirect URL config.' }
    } catch (e: any) {
      return { data: null, error: e?.message || 'Google sign-in failed' }
    }
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession()
    if (error) return null
    return data.session
  },

  async getProfile(): Promise<ApiResponse<Profile>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }
    const { data, error } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()
    if (error) return { data: null, error: error.message }
    return { data, error: null }
  },

  async updateProfile(updates: Partial<Pick<Profile, 'full_name' | 'push_token'>>): Promise<ApiResponse<Profile>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }
    const { data, error } = await supabase
      .from('profiles').update(updates).eq('id', user.id).select().single()
    if (error) return { data: null, error: error.message }
    return { data, error: null }
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut()
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback)
  },
}