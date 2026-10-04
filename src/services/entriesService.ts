// src/services/entriesService.ts
// All database operations for entries.
//
// Caching strategy:
//   • Paginated display (getEntries) — page 0 is cached in AsyncStorage.
//     Subsequent pages are fetched on demand and appended to cache.
//     On offline load, the cached pages serve as the offline dataset.
//   • Export (getAllEntries) — reads from the full local cache first;
//     only hits the network to top up if cache is stale (>5 min) or empty.
//     This avoids fetching 9999 rows on every export.
//   • getBookSummary — uses a lightweight `amount,type` only query (no joins).

import supabase from './supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Entry, EntryFormData, EntryFilter, ApiResponse } from '../types'
import { PAGE_SIZE } from '../constants'
import { normalizeEntryAmount } from '../utils/money'

// ─── Cache helpers ────────────────────────────────────────────
// TWO separate caches prevent the "export returns only 30 entries" bug:
//
//   displayCacheKey → written ONLY by getEntries(page=0)
//                     holds the latest 30 entries for offline display
//
//   fullCacheKey    → written ONLY by getAllEntries
//                     holds ALL entries; used exclusively for export
//
// If both used the same key, getAllEntries would find a fresh 30-entry
// display cache and return only 30 entries — exactly the bug being fixed.

const CACHE_V = 'v2'

// Display cache — page-0 only, 30 entries max
const displayCacheKey = (u: string, b: string) => `cashflow:entries_display:${CACHE_V}:${u}:${b}`

// Full export cache — all entries
const fullCacheKey = (u: string, b: string) => `cashflow:entries_full:${CACHE_V}:${u}:${b}`
const fullCacheMetaKey = (u: string, b: string) => `cashflow:entries_full_meta:${CACHE_V}:${u}:${b}`
const FULL_CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes

async function readDisplayCache(userId: string, bookId: string): Promise<Entry[]> {
  try {
    const raw = await AsyncStorage.getItem(displayCacheKey(userId, bookId))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

async function writeDisplayCache(userId: string, bookId: string, entries: Entry[]): Promise<void> {
  try { await AsyncStorage.setItem(displayCacheKey(userId, bookId), JSON.stringify(entries)) } catch { }
}

async function readFullCache(userId: string, bookId: string): Promise<Entry[]> {
  try {
    const raw = await AsyncStorage.getItem(fullCacheKey(userId, bookId))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

async function writeFullCache(userId: string, bookId: string, entries: Entry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(fullCacheKey(userId, bookId), JSON.stringify(entries))
    await AsyncStorage.setItem(fullCacheMetaKey(userId, bookId), JSON.stringify({ updatedAt: Date.now() }))
  } catch { }
}

async function isFullCacheStale(userId: string, bookId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(fullCacheMetaKey(userId, bookId))
    if (!raw) return true
    return (Date.now() - (JSON.parse(raw).updatedAt ?? 0)) > FULL_CACHE_TTL_MS
  } catch { return true }
}

async function invalidateCache(userId: string, bookId: string): Promise<void> {
  try { await AsyncStorage.removeItem(fullCacheMetaKey(userId, bookId)) } catch { }
}

// ─── Service ──────────────────────────────────────────────────
export const entriesService = {

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
    const { data: { user } } = await supabase.auth.getUser()
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
   * All entries for a book — used by Export and by offline display.
   * Reads from cache first; only fetches from network when cache is stale.
   * Does NOT use .range(0, 9999) — instead fetches in background pages.
   */
  async getAllEntries(
    bookId: string,
    filter: EntryFilter = 'all'
  ): Promise<ApiResponse<Entry[]>> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }
    const stale = await isFullCacheStale(user.id, bookId)
    const cached = await readFullCache(user.id, bookId)

    if (!stale && cached.length > 0) {
      // Cache is fresh — apply filter and return immediately
      const filtered = filter === 'all' ? cached : cached.filter(e => e.type === filter)
      return { data: filtered, error: null }
    }

    // Full cache is stale or empty — fetch all pages from server
    const allEntries: Entry[] = []
    let page = 0
    const BATCH = 500  // larger batches for export efficiency

    while (true) {
      let q = supabase
        .from('entries')
        .select(`*, profile:profiles(id, email, full_name)`)
        .eq('book_id', bookId)
        .order('entry_date', { ascending: false })
        .range(page * BATCH, (page + 1) * BATCH - 1)

      const { data, error } = await q
      if (error) {
        // Network failure — return stale cache if available
        const staleCached = await readFullCache(user.id, bookId)
        if (staleCached.length > 0) {
          const filtered = filter === 'all' ? staleCached : staleCached.filter(e => e.type === filter)
          return { data: filtered, error: null }
        }
        return { data: null, error: error.message }
      }

      allEntries.push(...(data ?? []))

      // Stop when we get fewer entries than batch size (last page)
      if (!data || data.length < BATCH) break

      // Safety cap: max 10 pages × 500 = 5000 entries
      if (++page >= 10 && data.length === BATCH) {
        return { data: null, error: 'Export is incomplete: more than 5,000 entries require additional pages' }
      }
    }

    // Preserve any unsync'd local temp entries
    const tempEntries = cached.filter(e => e.id.startsWith('local_'))
    const final = [...tempEntries, ...allEntries]

    await writeFullCache(user.id, bookId, final)

    const filtered = filter === 'all' ? final : final.filter(e => e.type === filter)
    return { data: filtered, error: null }
  },

  /**
   * Create a single entry (used by AddEditEntryScreen).
   * After creation, invalidates the cache so next getAllEntries re-fetches.
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
    // Also invalidate full cache so next export re-fetches fresh data
    if (data) {
      const display = await readDisplayCache(user.id, bookId)
      const updated = [data, ...display.filter(e => e.id !== data.id)]
        .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())
      await writeDisplayCache(user.id, bookId, updated)
      await invalidateCache(user.id, bookId)  // force export cache refresh
    }

    return { data, error: null }
  },

  /**
   * Batch create entries — used by CSV import.
   * Inserts in chunks of 100, then invalidates cache.
   */
  async batchCreateEntries(
    bookId: string,
    rows: { amount: number | string; type: string; note: string | null; entry_date: string }[]
  ): Promise<{ inserted: number; failed: number }> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { inserted: 0, failed: rows.length }

    const CHUNK = 100
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

    // Invalidate cache so next fetch gets fresh data including imported entries
    if (inserted > 0) await invalidateCache(user.id, bookId)

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
      await invalidateCache(user.id, data.book_id)
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
    await invalidateCache(user.id, data.book_id)
    return { data: null, error: null }
  },

  async applyRealtimeEntry(entry: Entry, expectedUserId?: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || expectedUserId && user.id !== expectedUserId) return
    const display = await readDisplayCache(user.id, entry.book_id)
    const next = [entry, ...display.filter(item => item.id !== entry.id)]
      .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())
      .slice(0, PAGE_SIZE)
    await writeDisplayCache(user.id, entry.book_id, next)
    await invalidateCache(user.id, entry.book_id)
  },

  async applyRealtimeDelete(bookId: string, entryId: string, expectedUserId?: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || expectedUserId && user.id !== expectedUserId) return
    const display = await readDisplayCache(user.id, bookId)
    await writeDisplayCache(user.id, bookId, display.filter(entry => entry.id !== entryId))
    await invalidateCache(user.id, bookId)
  },

  /**
   * Invalidate cache for a book — call after batch deletes.
   */
  async invalidateBookCache(bookId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await invalidateCache(user.id, bookId)
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
    const { data: { user }, error: authError } = await supabase.auth.getUser()
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
