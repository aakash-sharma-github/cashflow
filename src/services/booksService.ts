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

    const [{ data, error }, { data: summaries, error: summaryError }] = await Promise.all([
      supabase
        .from('books')
        .select('*, book_members!inner(role, user_id)')
        .eq('book_members.user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.rpc('get_book_financial_summaries_exact', { p_book_id: null }),
    ])

    if (error || summaryError) return { data: null, error: (error || summaryError)!.message }

    const summaryByBook = new Map((summaries ?? []).map((summary: any) => [summary.book_id, summary]))
    if ((data ?? []).some((book: any) => !summaryByBook.has(book.id))) {
      return { data: null, error: 'Financial totals are unavailable for one or more books' }
    }
    const enriched: Book[] = (data || []).map((book: any) => {
      const myMembership = book.book_members?.find((m: any) => m.user_id === user.id)
      const summary: any = summaryByBook.get(book.id)

      const { book_members, ...bookData } = book
      return {
        ...bookData,
        role: myMembership?.role,
        cash_in: String(summary?.cash_in ?? '0'),
        cash_out: String(summary?.cash_out ?? '0'),
        balance: String(summary?.balance ?? '0'),
        member_count: Number(summary?.member_count ?? 1),
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

    const [{ data, error }, { data: summaries, error: summaryError }] = await Promise.all([
      supabase
        .from('books')
        .select('*, book_members!inner(role, user_id)')
        .eq('id', id)
        .eq('book_members.user_id', user.id)
        .single(),
      supabase.rpc('get_book_financial_summaries_exact', { p_book_id: id }),
    ])

    if (error || summaryError) return { data: null, error: (error || summaryError)!.message }
    const summary: any = summaries?.find((item: any) => item.book_id === id)
    if (!summary) return { data: null, error: 'Book not found or unavailable' }

    const myMembership = data.book_members?.find((m: any) => m.user_id === user.id)

    const { book_members, ...bookData } = data
    return {
      data: {
        ...bookData,
        role: myMembership?.role,
        cash_in: String(summary.cash_in),
        cash_out: String(summary.cash_out),
        balance: String(summary.balance),
        member_count: Number(summary.member_count),
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
