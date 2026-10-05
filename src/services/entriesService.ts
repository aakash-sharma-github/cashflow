// src/services/entriesService.ts
// All database operations for entries.
//
// Caching strategy:
//   • Paginated display (getEntries) — page 0 is cached in AsyncStorage.
//     Subsequent pages are fetched on demand and appended to cache.
//     On offline load, the cached pages serve as the offline dataset.
//   • Export (getAllEntries) — always fetches every server page. Export must
//     not treat a local cache or the visible page as complete financial data.
//   • getBookSummary — uses a lightweight `amount,type` only query (no joins).

import supabase, { getSessionUser } from './supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Entry, EntryFormData, EntryFilter, ApiResponse } from '../types'
import { PAGE_SIZE } from '../constants'
import { normalizeEntryAmount } from '../utils/money'
import { useOfflineStore } from '../store/offlineStore'

// ─── Cache helpers ────────────────────────────────────────────
// The display cache is intentionally separate from exports. It contains only
// the first display page and must never be used as a complete export dataset.

const CACHE_V = 'v2'

// Display cache — page-0 only, 30 entries max
const displayCacheKey = (u: string, b: string) => `cashflow:entries_display:${CACHE_V}:${u}:${b}`


async function readDisplayCache(userId: string, bookId: string): Promise<Entry[]> {
  try {
    const raw = await AsyncStorage.getItem(displayCacheKey(userId, bookId))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

async function writeDisplayCache(userId: string, bookId: string, entries: Entry[]): Promise<void> {
  try { await AsyncStorage.setItem(displayCacheKey(userId, bookId), JSON.stringify(entries)) } catch { }
}

// ─── Service ──────────────────────────────────────────────────
export const entriesService = {

  async deleteAllEntries(bookId: string): Promise<ApiResponse<null>> {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { data: null, error: authError?.message ?? 'Not authenticated' }
    const { error } = await supabase.rpc('delete_book_entries', { p_book_id: bookId })
    if (error) return { data: null, error: error.message }
    await entriesService.invalidateBookCache(bookId)
    return { data: null, error: null }
  },

  /**
   * Paginated entries for display in BookDetailScreen.
   * Page 0 result is merged into the local cache so it's available offline.
   */
  async getEntries(
    bookId: string,
    filter: EntryFilter = 'all',
    page = 0,
    expectedUserId?: string,
  ): Promise<ApiResponse<Entry[]>> {
    const { user } = await getSessionUser()
    if (!user) return { data: null, error: 'Not authenticated' }
    if (expectedUserId && user.id !== expectedUserId) return { data: null, error: 'Authenticated account changed before entries loaded' }

    let query = supabase
      .from('entries')
      .select(`*, profile:profiles(id, email, full_name)`)
      .eq('book_id', bookId)
      .order('entry_date', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filter !== 'all') {
      query = query.eq('type', filter)
    }

    const { data, error } = await query

    if (error) return { data: null, error: error.message }

    // Write page-0 to DISPLAY cache only — keeps latest entries available offline
    // Does NOT write to the full/export cache to avoid the 30-entry export bug
    if (page === 0 && filter === 'all' && data) {
      const existing = await readDisplayCache(user.id, bookId)
      const tempEntries = existing.filter(e => e.id.startsWith('local_'))
      await writeDisplayCache(user.id, bookId, [...tempEntries, ...data])
    }

    return { data: data ?? [], error: null }
  },

  /**
   * All server entries for a book, for complete exports.
   * Never substitutes cached or currently visible rows when a request fails.
   */
  async getAllEntries(
    bookId: string,
    filter: EntryFilter = 'all'
  ): Promise<ApiResponse<Entry[]>> {
    try {
      const { user, error: authError } = await getSessionUser()
      if (authError || !user) return { data: null, error: authError?.message ?? 'Not authenticated' }

      const hasPendingBookEntries = useOfflineStore.getState().pendingQueue.some(op => {
        if (!['CREATE_ENTRY', 'UPDATE_ENTRY', 'DELETE_ENTRY', 'DELETE_BOOK_ENTRIES'].includes(op.type)) return false
        const queuedBookId = op.payload.book_id ?? op.payload.bookId
        return queuedBookId === bookId && (!op.userId || op.userId === user.id)
      })
      if (hasPendingBookEntries) {
        return { data: null, error: 'Export unavailable: sync pending changes for this book first' }
      }

      const allEntries: Entry[] = []
      const BATCH = 500
      let page = 0
      while (true) {
        let query = supabase
          .from('entries')
          .select(`*, profile:profiles(id, email, full_name)`)
          .eq('book_id', bookId)
          .order('entry_date', { ascending: false })
          .order('id', { ascending: false })
          .range(page * BATCH, (page + 1) * BATCH - 1)
        if (filter !== 'all') query = query.eq('type', filter)

        const { data, error } = await query
        if (error) return { data: null, error: `Export failed while loading page ${page + 1}: ${error.message}` }
        if (data === null) return { data: null, error: `Export failed: server returned no data for page ${page + 1}` }
        const rows = data
        allEntries.push(...rows)
        if (rows.length < BATCH) break
        page += 1
      }

      const { data: summary, error: summaryError } = await entriesService.getBookSummary(bookId, user.id)
      if (summaryError || !summary) return { data: null, error: `Export failed while verifying completeness: ${summaryError ?? 'book summary unavailable'}` }
      let expectedCount = summary.entry_count
      if (filter !== 'all') {
        const { count, error } = await supabase.from('entries')
          .select('id', { count: 'exact', head: true })
          .eq('book_id', bookId)
          .eq('type', filter)
        if (error || count === null) return { data: null, error: `Export failed while verifying filtered entry count: ${error?.message ?? 'count unavailable'}` }
        expectedCount = count
      }
      if (expectedCount !== allEntries.length) {
        return { data: null, error: `Export incomplete: server reports ${expectedCount} matching entries but ${allEntries.length} were retrieved` }
      }

      return { data: allEntries, error: null }
    } catch (error: any) {
      return { data: null, error: error?.message ?? 'Export failed while loading entries' }
    }
  },

  /**
   * Create a single entry (used by AddEditEntryScreen).
   * After creation, updates the display cache.
   */
  async createEntry(
    bookId: string,
    formData: EntryFormData,
    clientEntryId: string,
  ): Promise<ApiResponse<Entry>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }
    const amount = normalizeEntryAmount(formData.amount)
    if (!amount) return { data: null, error: 'Amount must be positive and no greater than 9,999,999,999.99, with up to 2 decimal places.' }

    const { data, error } = await supabase
      .from('entries')
      .insert({
        id: clientEntryId,
        book_id: bookId,
        user_id: user.id,
        amount,
        type: formData.type,
        note: formData.note?.trim() || null,
        entry_date: formData.entry_date.toISOString(),
      })
      .select(`*, profile:profiles(id, email, full_name)`)
      .single()

    if (error) {
      if (error.code === '23505') {
        const existing = await supabase
          .from('entries')
          .select(`*, profile:profiles(id, email, full_name)`)
          .eq('id', clientEntryId)
          .eq('book_id', bookId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (existing.data) return { data: existing.data, error: null }
      }
      return { data: null, error: error.message }
    }

    // Update display cache immediately so offline list stays current
    if (data) {
      const display = await readDisplayCache(user.id, bookId)
      const updated = [data, ...display.filter(e => e.id !== data.id)]
        .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())
      await writeDisplayCache(user.id, bookId, updated)
    }

    return { data, error: null }
  },

  /**
   * Batch create entries — used by CSV import.
   * Inserts in bounded chunks to avoid a per-row request on large imports.
   */
  async batchCreateEntries(
    bookId: string,
    rows: { amount: number | string; type: string; note: string | null; entry_date: string }[]
  ): Promise<{ inserted: number; failed: number }> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { inserted: 0, failed: rows.length }

    const CHUNK = 500
    let inserted = 0
    let failed = 0

    for (let i = 0; i < rows.length; i += CHUNK) {
      const selected = rows.slice(i, i + CHUNK)
      const chunk = selected.flatMap(r => {
        const amount = normalizeEntryAmount(r.amount)
        if (!amount || !['cash_in', 'cash_out'].includes(r.type)) {
          failed++
          return []
        }
        return [{
        book_id: bookId,
        user_id: user.id,
        amount,
        type: r.type,
        note: r.note,
        entry_date: r.entry_date,
        }]
      })
      if (!chunk.length) continue

      const { data, error } = await supabase
        .from('entries')
        .insert(chunk)
        .select('id')

      if (error) {
        failed += chunk.length
      } else {
        inserted += (data?.length ?? 0)
      }
    }

    return { inserted, failed }
  },

  /**
   * Update a single entry.
   */
  async updateEntry(
    id: string,
    formData: Partial<EntryFormData>
  ): Promise<ApiResponse<Entry>> {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { data: null, error: authError?.message ?? 'Not authenticated' }
    const updates: Record<string, unknown> = {}
    if (formData.amount !== undefined) {
      const amount = normalizeEntryAmount(formData.amount)
      if (!amount) return { data: null, error: 'Amount must be positive and no greater than 9,999,999,999.99, with up to 2 decimal places.' }
      updates.amount = amount
    }
    if (formData.type !== undefined) updates.type = formData.type
    if (formData.note !== undefined) updates.note = formData.note?.trim() || null
    if (formData.entry_date !== undefined) updates.entry_date = formData.entry_date.toISOString()

    const { data, error } = await supabase
      .from('entries')
      .update(updates)
      .eq('id', id)
      .select(`*, profile:profiles(id, email, full_name)`)
      .single()

    if (error) return { data: null, error: error.message }

    // Update display cache in-place; invalidate full export cache
    if (data) {
      const display = await readDisplayCache(user.id, data.book_id)
      const idx = display.findIndex(e => e.id === id)
      if (idx >= 0) { display[idx] = data; await writeDisplayCache(user.id, data.book_id, display) }
    }

    return { data, error: null }
  },

  /**
   * Delete a single entry.
   */
  async deleteEntry(id: string): Promise<ApiResponse<null>> {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { data: null, error: authError?.message ?? 'Not authenticated' }
    const { data, error } = await supabase
      .from('entries')
      .delete()
      .eq('id', id)
      .select('id,book_id')
      .single()

    if (error) return { data: null, error: error.message }
    const display = await readDisplayCache(user.id, data.book_id)
    await writeDisplayCache(user.id, data.book_id, display.filter(entry => entry.id !== id))
    return { data: null, error: null }
  },

  async applyRealtimeEntry(entry: Entry, expectedUserId?: string): Promise<void> {
    const { user } = await getSessionUser()
    if (!user || expectedUserId && user.id !== expectedUserId) return
    const display = await readDisplayCache(user.id, entry.book_id)
    const next = [entry, ...display.filter(item => item.id !== entry.id)]
      .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())
      .slice(0, PAGE_SIZE)
    await writeDisplayCache(user.id, entry.book_id, next)
  },

  async applyRealtimeDelete(bookId: string, entryId: string, expectedUserId?: string): Promise<void> {
    const { user } = await getSessionUser()
    if (!user || expectedUserId && user.id !== expectedUserId) return
    const display = await readDisplayCache(user.id, bookId)
    await writeDisplayCache(user.id, bookId, display.filter(entry => entry.id !== entryId))
  },

  /**
   * Invalidate the display cache for a book — call after batch deletes.
   */
  async invalidateBookCache(bookId: string): Promise<void> {
    const { user } = await getSessionUser()
    if (!user) return
    try { await AsyncStorage.removeItem(displayCacheKey(user.id, bookId)) } catch { }
  },

  /**
   * Authoritative aggregate computed in PostgreSQL, independent of PostgREST
   * row limits and entry pagination.
   */
  async getBookSummary(bookId: string, expectedUserId?: string): Promise<ApiResponse<{
    balance: string
    cash_in: string
    cash_out: string
    entry_count: number
  }>> {
    const { user, error: authError } = await getSessionUser()
    if (authError || !user) return { data: null, error: authError?.message ?? 'Not authenticated' }
    if (expectedUserId && user.id !== expectedUserId) return { data: null, error: 'Authenticated account changed before summary loaded' }
    const { data, error } = await supabase.rpc('get_book_financial_summaries_exact', {
      p_book_id: bookId,
    })

    if (error) return { data: null, error: error.message }
    const summary = data?.find((item: any) => item.book_id === bookId)
    if (!summary) return { data: null, error: 'Book not found or unavailable' }

    return {
      data: {
        cash_in: String(summary.cash_in),
        cash_out: String(summary.cash_out),
        balance: String(summary.balance),
        entry_count: Number(summary.entry_count),
      },
      error: null,
    }
  },
}
