// src/services/invitationsService.ts
import supabase from './supabase'
import type { Invitation, BookMember, ApiResponse } from '../types'

export const invitationsService = {
  /**
   * Send an invitation to a user by email
   */
  async sendInvitation(
    bookId: string,
    inviteeEmail: string,
    bookName: string
  ): Promise<ApiResponse<Invitation>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Check if user already a member
    const { data: existingMember } = await supabase
      .from('book_members')
      .select('id')
      .eq('book_id', bookId)
      .eq('user_id', (
        await supabase.from('profiles').select('id').eq('email', inviteeEmail).single()
      ).data?.id || '')
      .single()

    if (existingMember) {
      return { data: null, error: 'This user is already a member of this book' }
    }

    // Create invitation record
    const { data: invitation, error } = await supabase
      .from('invitations')
      .insert({
        book_id: bookId,
        inviter_id: user.id,
        invitee_email: inviteeEmail.toLowerCase().trim(),
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { data: null, error: 'An invitation has already been sent to this email' }
      }
      return { data: null, error: error.message }
    }

    // Fire and forget: send email via edge function
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    supabase.functions.invoke('send-invite', {
      body: {
        invitationId: invitation.id,
        bookName,
        inviterName: profile?.full_name || profile?.email || 'Someone',
        inviteeEmail,
      },
    }).catch(console.error)

    return { data: invitation, error: null }
  },

  /**
   * Get all invitations for the current user (received)
   */
  async getMyInvitations(): Promise<ApiResponse<Invitation[]>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .single()

    if (!profile) return { data: [], error: null }

    const { data, error } = await supabase
      .from('invitations')
      .select(`
        *,
        book:books(id, name, color),
        inviter:profiles!invitations_inviter_id_fkey(id, email, full_name)
      `)
      .eq('invitee_email', profile.email)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) return { data: null, error: error.message }
    return { data: data || [], error: null }
  },

  /**
   * Get invitations sent for a specific book
   */
  async getBookInvitations(bookId: string): Promise<ApiResponse<Invitation[]>> {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })

    if (error) return { data: null, error: error.message }
    return { data: data || [], error: null }
  },

  /**
   * Accept an invitation (uses secure DB function)
   */
  async acceptInvitation(invitationId: string): Promise<ApiResponse<null>> {
    const { error } = await supabase.rpc('accept_invitation', {
      p_invitation_id: invitationId,
    })

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  },

  /**
   * Reject an invitation
   */
  async rejectInvitation(invitationId: string): Promise<ApiResponse<null>> {
    const { error } = await supabase.rpc('reject_invitation', {
      p_invitation_id: invitationId,
    })

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  },

  /**
   * Cancel/delete a pending invitation (inviter only)
   */
  async cancelInvitation(invitationId: string): Promise<ApiResponse<null>> {
    const { error } = await supabase
      .from('invitations')
      .delete()
      .eq('id', invitationId)

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  },

  /**
   * Get all members of a book
   */
  async getBookMembers(bookId: string): Promise<ApiResponse<BookMember[]>> {
    const { data, error } = await supabase
      .from('book_members')
      .select(`
        *,
        profile:profiles(id, email, full_name, avatar_url)
      `)
      .eq('book_id', bookId)
      .order('joined_at', { ascending: true })

    if (error) return { data: null, error: error.message }
    return { data: data || [], error: null }
  },

  /**
   * Remove a member from a book (owner only)
   */
  async removeMember(bookId: string, userId: string): Promise<ApiResponse<null>> {
    const { error } = await supabase
      .from('book_members')
      .delete()
      .eq('book_id', bookId)
      .eq('user_id', userId)

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  },
}
