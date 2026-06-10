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
    // Sort so CREATE_BOOK always runs before CREATE_ENTRY/UPDATE_ENTRY/DELETE_ENTRY.
    // This is critical when a book and its entries were both created offline:
    // CREATE_BOOK must sync first and patch its book_id into sibling entry ops.
    const TYPE_ORDER: Record<string, number> = {
      CREATE_BOOK: 0, UPDATE_BOOK: 1, DELETE_BOOK: 2,
      CREATE_ENTRY: 3, UPDATE_ENTRY: 4, DELETE_ENTRY: 5,
    }
    ops.sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9))
    const allOps = ops  // reference used by CREATE_BOOK to patch siblings

    const succeeded: string[] = []
    const failed: string[] = []
    const errors: Record<string, string> = {}

    for (const op of allOps) {
      try {
        await syncService.replayOne(op, userId, allOps)
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

  async replayOne(op: PendingOperation, userId: string, allOps: PendingOperation[]): Promise<void> {
    const { type, payload } = op

    switch (type) {
      // ── Books ─────────────────────────────────────────
      case 'CREATE_BOOK': {
        const { tempId, ...bookData } = payload
        const { data, error } = await supabase
          .rpc('create_book', {
            p_name: bookData.name,
            p_description: bookData.description || null,
            p_color: bookData.color,
            p_currency: bookData.currency,
          })
        if (error) {
          if (error.code === '23505') {
            console.warn('[Sync] CREATE_BOOK duplicate — skipping')
            break
          }
          throw new Error(error.message)
        }
        // Update local cache: replace temp record with real server record
        if (tempId && data) {
          const realId = data.id
          const books = await localBooksDb.getAll(userId)
          const updated = books.map(b =>
            b.id === tempId ? { ...b, ...data, role: 'owner' as const } : b
          )
          await localBooksDb.save(userId, updated)

          // CRITICAL: patch all subsequent queued operations that reference
          // the temp book ID. Without this, CREATE_ENTRY ops for this book
          // will fail with "invalid input syntax for type uuid: local_xxx".
          // The pending ops array is mutated in-place so later iterations
          // of this loop see the corrected book_id.
          for (const pendingOp of allOps) {
            if (
              ['CREATE_ENTRY', 'UPDATE_ENTRY', 'DELETE_ENTRY'].includes(pendingOp.type) &&
              pendingOp.payload.book_id === tempId
            ) {
              pendingOp.payload.book_id = realId
              console.log('[Sync] Patched', pendingOp.type, 'book_id:', tempId, '→', realId)
            }
          }
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
        // If book_id is still a temp ID, CREATE_BOOK hasn't synced yet
        // This shouldn't happen if ops are processed in order + CREATE_BOOK patches them,
        // but guard against it anyway
        if (entryData.book_id && entryData.book_id.startsWith('local_')) {
          console.warn('[Sync] CREATE_ENTRY skipped — book_id is still temp:', entryData.book_id)
          throw new Error('Book not yet synced — retry after CREATE_BOOK')
        }
        const { data, error } = await supabase
          .from('entries')
          .insert({ ...entryData, user_id: userId })
          .select()
          .single()

        if (error) {
          // 23505 = unique_violation — entry already exists on server (duplicate)
          // Treat as success so we don't retry it forever
          if (error.code === '23505') {
            console.warn('[Sync] CREATE_ENTRY duplicate — skipping:', error.message)
            // Clean up the temp entry from local cache
            if (tempId) {
              const bookId = entryData.book_id
              const entries = await localEntriesDb.getByBook(userId, bookId)
              const cleaned = entries.filter(e => e.id !== tempId)
              await localEntriesDb.save(userId, bookId, cleaned)
            }
            break
          }
          throw new Error(error.message)
        }

        // Replace temp entry in local cache with server-confirmed entry
        if (tempId && data) {
          const bookId = entryData.book_id
          const entries = await localEntriesDb.getByBook(userId, bookId)
          const updated = entries.map(e => e.id === tempId ? { ...e, ...data } : e)
          await localEntriesDb.save(userId, bookId, updated)

          // Also update Zustand state so UI shows server ID immediately
          const { useEntriesStore } = require('../store/entriesStore')
          const entriesStore = useEntriesStore.getState()
          if (entriesStore.entries.some((e: any) => e.id === tempId)) {
            entriesStore.entries = entriesStore.entries.map((e: any) =>
              e.id === tempId ? { ...e, ...data } : e
            )
          }
        }
        break
      }

      case 'UPDATE_ENTRY': {
        const { entryId, ...updates } = payload
        // Skip if entryId is still a temp ID (CREATE_ENTRY hasn't synced yet)
        if (entryId && entryId.startsWith('local_')) {
          console.warn('[Sync] UPDATE_ENTRY skipped — entryId is still temp:', entryId)
          throw new Error('Entry not yet synced — retry after CREATE_ENTRY')
        }
        const { error } = await supabase
          .from('entries')
          .update(updates)
          .eq('id', entryId)
        if (error) throw new Error(error.message)
        break
      }

      case 'DELETE_ENTRY': {
        // If entryId is still a temp ID, the entry never reached the server
        // Treat as success — just remove from local cache
        if (payload.entryId && payload.entryId.startsWith('local_')) {
          console.log('[Sync] DELETE_ENTRY skipped — temp entry never reached server:', payload.entryId)
          // Remove from local cache
          if (payload.book_id) {
            const entries = await localEntriesDb.getByBook(userId, payload.book_id)
            const cleaned = entries.filter(e => e.id !== payload.entryId)
            await localEntriesDb.save(userId, payload.book_id, cleaned)
          }
          break
        }
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