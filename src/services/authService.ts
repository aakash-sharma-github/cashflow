// src/services/authService.ts
import supabase from './supabase'
import type { Profile, ApiResponse } from '../types'

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

    // DEBUG: Log user info
    if (!user) {
      console.log("❌ NOT LOGGED IN");
    } else {
      console.log("✅ LOGGED IN:", user.id);
    }


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
