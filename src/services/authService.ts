// src/services/authService.ts
import supabase from './supabase'
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import type { Profile, ApiResponse } from '../types'

// Required for expo-auth-session to work on Android
WebBrowser.maybeCompleteAuthSession()

export const authService = {
  /**
   * Send magic link OTP to email
   */
  async sendOtp(email: string): Promise<ApiResponse<null>> {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: 'cashflow://auth/callback',
      },
    })
    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  },

  /**
   * Verify OTP token
   */
  async verifyOtp(email: string, token: string): Promise<ApiResponse<null>> {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })
    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  },

  /**
   * Sign in with Google OAuth via expo-auth-session
   */
  async signInWithGoogle(): Promise<ApiResponse<null>> {
    try {
      const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'cashflow' })

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      })

      if (error) return { data: null, error: error.message }
      if (!data.url) return { data: null, error: 'No OAuth URL returned' }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)

      if (result.type === 'success' && result.url) {
        // Extract tokens from callback URL
        const url = new URL(result.url)

        // Try hash params first (implicit flow)
        const hashParams = new URLSearchParams(url.hash.replace('#', ''))
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

        // Try query params (PKCE flow)
        const code = url.searchParams.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) return { data: null, error: exchangeError.message }
          return { data: null, error: null }
        }

        return { data: null, error: 'Could not extract session from callback URL' }
      }

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { data: null, error: 'cancelled' }
      }

      return { data: null, error: 'Authentication failed' }
    } catch (e: any) {
      return { data: null, error: e.message || 'Google sign-in failed' }
    }
  },

  /**
   * Get current session
   */
  async getSession() {
    const { data, error } = await supabase.auth.getSession()
    if (error) return null
    return data.session
  },

  /**
   * Get current user profile
   */
  async getProfile(): Promise<ApiResponse<Profile>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) return { data: null, error: error.message }
    return { data, error: null }
  },

  /**
   * Update profile
   */
  async updateProfile(updates: Partial<Pick<Profile, 'full_name' | 'push_token'>>): Promise<ApiResponse<Profile>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()

    if (error) return { data: null, error: error.message }
    return { data, error: null }
  },

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    await supabase.auth.signOut()
  },

  /**
   * Listen to auth state changes
   */
  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback)
  },
}
