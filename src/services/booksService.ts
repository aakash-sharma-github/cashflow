// src/services/booksService.ts
import supabase from './supabase'
import type { Book, BookFormData, ApiResponse } from '../types'

export const booksService = {
  /**
   * Fetch all books the current user is a member of,
   * with computed balance, member count, and role
   */
  async getBooks(): Promise<ApiResponse<Book[]>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('books')
      .select(`
        *,
        book_members!inner(role, user_id),
        entries(amount, type)
      `)
      .eq('book_members.user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return { data: null, error: error.message }

    // Compute balance and role per book
    const enriched: Book[] = (data || []).map((book: any) => {
      const myMembership = book.book_members?.find((m: any) => m.user_id === user.id)
      const cashIn = book.entries
        ?.filter((e: any) => e.type === 'cash_in')
        .reduce((s: number, e: any) => s + Number(e.amount), 0) || 0
      const cashOut = book.entries
        ?.filter((e: any) => e.type === 'cash_out')
        .reduce((s: number, e: any) => s + Number(e.amount), 0) || 0

      const { entries, book_members, ...bookData } = book
      return {
        ...bookData,
        role: myMembership?.role,
        cash_in: cashIn,
        cash_out: cashOut,
        balance: cashIn - cashOut,
        member_count: book.book_members?.length || 1,
      }
    })

    return { data: enriched, error: null }
  },

  /**
   * Get a single book by ID
   */
  async getBook(id: string): Promise<ApiResponse<Book>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('books')
      .select(`
        *,
        book_members!inner(role, user_id),
        entries(amount, type)
      `)
      .eq('id', id)
      .eq('book_members.user_id', user.id)
      .single()

    if (error) return { data: null, error: error.message }

    const myMembership = data.book_members?.find((m: any) => m.user_id === user.id)
    const cashIn = data.entries?.filter((e: any) => e.type === 'cash_in').reduce((s: number, e: any) => s + Number(e.amount), 0) || 0
    const cashOut = data.entries?.filter((e: any) => e.type === 'cash_out').reduce((s: number, e: any) => s + Number(e.amount), 0) || 0

    const { entries, book_members, ...bookData } = data
    return {
      data: {
        ...bookData,
        role: myMembership?.role,
        cash_in: cashIn,
        cash_out: cashOut,
        balance: cashIn - cashOut,
        member_count: data.book_members?.length || 1,
      },
      error: null,
    }
  },

  /**
   * Create a new book
   */
  async createBook(formData: BookFormData): Promise<ApiResponse<Book>> {
    // Use the create_book() SECURITY DEFINER function instead of direct INSERT.
    // This bypasses the books RLS policy which can fail if auth.uid() is still
    // null during session hydration immediately after login.
    // The function validates auth.uid() server-side and inserts the book + owner
    // membership atomically.
    const { data, error } = await supabase
      .rpc('create_book', {
        p_name: formData.name.trim(),
        p_description: formData.description?.trim() || null,
        p_color: formData.color,
        p_currency: formData.currency,
      })

    if (error) return { data: null, error: error.message }
    return {
      data: {
        ...data,
        role: 'owner',
        balance: 0,
        cash_in: 0,
        cash_out: 0,
        member_count: 1,
      },
      error: null,
    }
  },

  /**
   * Update a book (owner only — enforced by RLS)
   */
  async updateBook(id: string, updates: Partial<BookFormData>): Promise<ApiResponse<Book>> {
    const { data, error } = await supabase
      .from('books')
      .update({
        ...(updates.name && { name: updates.name.trim() }),
        ...(updates.description !== undefined && { description: updates.description.trim() || null }),
        ...(updates.color && { color: updates.color }),
        ...(updates.currency && { currency: updates.currency }),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return { data: null, error: error.message }
    return { data, error: null }
  },

  /**
   * Delete a book (owner only — enforced by RLS)
   */
  async deleteBook(id: string): Promise<ApiResponse<null>> {
    const { error } = await supabase
      .from('books')
      .delete()
      .eq('id', id)

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  },
}