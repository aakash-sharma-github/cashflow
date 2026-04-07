// src/services/entriesService.ts
import supabase from './supabase'
import type { Entry, EntryFormData, EntryFilter, ApiResponse } from '../types'
import { PAGE_SIZE } from '../constants'

export const entriesService = {
  /**
   * Get paginated entries for a book with optional filter
   */
  async getEntries(
    bookId: string,
    filter: EntryFilter = 'all',
    page = 0
  ): Promise<ApiResponse<Entry[]>> {
    let query = supabase
      .from('entries')
      .select(`
        *,
        profile:profiles(id, email, full_name)
      `)
      .eq('book_id', bookId)
      .order('entry_date', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filter !== 'all') {
      query = query.eq('type', filter)
    }

    const { data, error } = await query

    if (error) return { data: null, error: error.message }
    return { data: data || [], error: null }
  },

  /**
   * Create a new entry
   */
  async createEntry(
    bookId: string,
    formData: EntryFormData
  ): Promise<ApiResponse<Entry>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('entries')
      .insert({
        book_id: bookId,
        user_id: user.id,
        amount: parseFloat(formData.amount),
        type: formData.type,
        note: formData.note.trim() || null,
        entry_date: formData.entry_date.toISOString(),
      })
      .select(`
        *,
        profile:profiles(id, email, full_name)
      `)
      .single()

    if (error) return { data: null, error: error.message }
    return { data, error: null }
  },

  /**
   * Update an entry
   */
  async updateEntry(
    id: string,
    formData: Partial<EntryFormData>
  ): Promise<ApiResponse<Entry>> {
    const updates: any = {}
    if (formData.amount !== undefined) updates.amount = parseFloat(formData.amount)
    if (formData.type !== undefined) updates.type = formData.type
    if (formData.note !== undefined) updates.note = formData.note.trim() || null
    if (formData.entry_date !== undefined) updates.entry_date = formData.entry_date.toISOString()

    const { data, error } = await supabase
      .from('entries')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        profile:profiles(id, email, full_name)
      `)
      .single()

    if (error) return { data: null, error: error.message }
    return { data, error: null }
  },

  /**
   * Delete an entry
   */
  async deleteEntry(id: string): Promise<ApiResponse<null>> {
    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', id)

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  },

  /**
   * Get book summary (total cash in/out/balance)
   * Uses a lightweight aggregate query
   */
  async getBookSummary(bookId: string): Promise<ApiResponse<{
    balance: number
    cash_in: number
    cash_out: number
    entry_count: number
  }>> {
    const { data, error } = await supabase
      .from('entries')
      .select('amount, type')
      .eq('book_id', bookId)

    if (error) return { data: null, error: error.message }

    const cash_in = (data || [])
      .filter(e => e.type === 'cash_in')
      .reduce((s, e) => s + Number(e.amount), 0)

    const cash_out = (data || [])
      .filter(e => e.type === 'cash_out')
      .reduce((s, e) => s + Number(e.amount), 0)

    return {
      data: {
        cash_in,
        cash_out,
        balance: cash_in - cash_out,
        entry_count: (data || []).length,
      },
      error: null,
    }
  },
}
