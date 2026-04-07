// src/services/syncService.ts
// Replays pending offline operations against the remote Supabase DB.
// Called when the app detects it is back online.

import supabase from './supabase'
import { localBooksDb, localEntriesDb, localMetaDb } from './localDb'
import type { PendingOperation } from '../store/offlineStore'

export interface SyncResult {
  succeeded: string[]
  failed: string[]
  errors: Record<string, string>
}

export const syncService = {
  /**
   * Replay all pending offline operations in order.
   * Returns IDs of succeeded and failed ops.
   */
  async replayQueue(ops: PendingOperation[], userId: string): Promise<SyncResult> {
    const succeeded: string[] = []
    const failed: string[] = []
    const errors: Record<string, string> = {}

    for (const op of ops) {
      try {
        await syncService.replayOne(op, userId)
        succeeded.push(op.id)
      } catch (err: any) {
        failed.push(op.id)
        errors[op.id] = err.message || 'Unknown error'
        console.warn(`[Sync] Failed op ${op.type} (${op.id}):`, err.message)
      }
    }

    if (succeeded.length > 0) {
      await localMetaDb.setLastSync(userId, new Date().toISOString())
    }

    return { succeeded, failed, errors }
  },

  async replayOne(op: PendingOperation, userId: string): Promise<void> {
    const { type, payload } = op

    switch (type) {
      // ── Books ─────────────────────────────────────────
      case 'CREATE_BOOK': {
        // Use the server-generated ID if available in payload,
        // otherwise upsert will create a new one.
        const { tempId, ...bookData } = payload
        const { data, error } = await supabase
          .from('books')
          .insert({ ...bookData, owner_id: userId })
          .select()
          .single()
        if (error) throw new Error(error.message)
        // Update local cache: replace temp record with real server record
        if (tempId && data) {
          const books = await localBooksDb.getAll(userId)
          const updated = books.map(b =>
            b.id === tempId ? { ...b, ...data, role: 'owner' as const } : b
          )
          await localBooksDb.save(userId, updated)
        }
        break
      }

      case 'UPDATE_BOOK': {
        const { bookId, ...updates } = payload
        const { error } = await supabase
          .from('books')
          .update(updates)
          .eq('id', bookId)
        if (error) throw new Error(error.message)
        break
      }

      case 'DELETE_BOOK': {
        const { error } = await supabase
          .from('books')
          .delete()
          .eq('id', payload.bookId)
        if (error) throw new Error(error.message)
        break
      }

      // ── Entries ───────────────────────────────────────
      case 'CREATE_ENTRY': {
        const { tempId, ...entryData } = payload
        const { data, error } = await supabase
          .from('entries')
          .insert({ ...entryData, user_id: userId })
          .select()
          .single()
        if (error) throw new Error(error.message)
        // Replace temp entry in local cache
        if (tempId && data) {
          const bookId = entryData.book_id
          const entries = await localEntriesDb.getByBook(userId, bookId)
          const updated = entries.map(e => e.id === tempId ? { ...e, ...data } : e)
          await localEntriesDb.save(userId, bookId, updated)
        }
        break
      }

      case 'UPDATE_ENTRY': {
        const { entryId, ...updates } = payload
        const { error } = await supabase
          .from('entries')
          .update(updates)
          .eq('id', entryId)
        if (error) throw new Error(error.message)
        break
      }

      case 'DELETE_ENTRY': {
        const { error } = await supabase
          .from('entries')
          .delete()
          .eq('id', payload.entryId)
        if (error) throw new Error(error.message)
        break
      }

      default:
        console.warn('[Sync] Unknown operation type:', type)
    }
  },

  /**
   * Full refresh: fetch all remote books + entries and overwrite local cache.
   * Called after a successful sync or on first login.
   */
  async fullRefresh(userId: string): Promise<void> {
    // Fetch books
    const { data: books } = await supabase
      .from('books')
      .select(`
        *,
        book_members!inner(role, user_id),
        entries(amount, type)
      `)
      .eq('book_members.user_id', userId)
      .order('created_at', { ascending: false })

    if (!books) return

    const enriched = books.map((book: any) => {
      const myMembership = book.book_members?.find((m: any) => m.user_id === userId)
      const cashIn = book.entries?.filter((e: any) => e.type === 'cash_in').reduce((s: number, e: any) => s + Number(e.amount), 0) || 0
      const cashOut = book.entries?.filter((e: any) => e.type === 'cash_out').reduce((s: number, e: any) => s + Number(e.amount), 0) || 0
      const { entries, book_members, ...bookData } = book
      return { ...bookData, role: myMembership?.role, cash_in: cashIn, cash_out: cashOut, balance: cashIn - cashOut, member_count: book.book_members?.length || 1 }
    })

    await localBooksDb.save(userId, enriched)

    // Fetch entries per book (up to 100 per book for cache)
    for (const book of enriched) {
      const { data: entries } = await supabase
        .from('entries')
        .select('*, profile:profiles(id, email, full_name)')
        .eq('book_id', book.id)
        .order('entry_date', { ascending: false })
        .limit(100)

      if (entries) {
        await localEntriesDb.save(userId, book.id, entries)
      }
    }

    await localMetaDb.setLastSync(userId, new Date().toISOString())
  },
}
