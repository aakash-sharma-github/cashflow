// src/store/booksStore.ts
// Cache-first strategy:
//   1. Load from localBooksDb immediately → instant UI, always works offline
//   2. If online, fetch from server in background → update UI silently
//   3. If server fetch fails → keep cache showing, never blank screen

import { create } from 'zustand'
import { booksService } from '../services/booksService'
import { useAuthStore } from './authStore'
import { useOfflineStore } from './offlineStore'
import { localBooksDb } from '../services/localDb'
import type { Book, BookFormData } from '../types'
import { logger } from '../utils/logger'

const genTempId = () =>
  `local_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`

interface BooksState {
  books: Book[]
  currentBook: Book | null
  isLoading: boolean
  error: string | null

  fetchBooks: () => Promise<void>
  fetchBook: (id: string) => Promise<void>
  createBook: (formData: BookFormData) => Promise<{ data: Book | null; error: string | null }>
  updateBook: (id: string, formData: Partial<BookFormData>) => Promise<{ error: string | null }>
  deleteBook: (id: string) => Promise<{ error: string | null }>
  setCurrentBook: (book: Book | null) => void
}

export const useBooksStore = create<BooksState>((set, get) => ({
  books: [],
  currentBook: null,
  isLoading: false,
  error: null,

  // ── fetchBooks ─────────────────────────────────────────────────
  // Step 1: Serve from local cache instantly (zero waiting)
  // Step 2: If online, refresh in background and update silently
  fetchBooks: async () => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return

    // ── Step 1: Load cache immediately ──────────────────────────
    const cached = await localBooksDb.getAll(userId)
    set({ books: cached, isLoading: cached.length === 0, error: null })

    // ── Step 2: Background network refresh ──────────────────────
    const { isOnline } = useOfflineStore.getState()
    if (!isOnline) {
      set({ isLoading: false })
      return
    }

    try {
      const { data, error } = await booksService.getBooks()
      if (error || !data) {
        // Check if error is auth-related — if so, don't log as network error
        // (this is expected when Supabase client hasn't hydrated JWT yet)
        if (error?.includes('Not authenticated') || error?.includes('JWT')) {
          logger.info('[Books] fetchBooks: auth not ready yet — showing cached books')
        } else {
          logger.warn('[Books] fetchBooks network error:', error)
        }
        set({ isLoading: false })
        return
      }
      await localBooksDb.save(userId, data)
      set({ books: data, isLoading: false, error: null })
    } catch (e) {
      logger.warn('[Books] fetchBooks exception:', e)
      set({ isLoading: false })
    }
  },

  // ── fetchBook ──────────────────────────────────────────────────
  fetchBook: async (id) => {
    const userId = useAuthStore.getState().user?.id
    const { isOnline } = useOfflineStore.getState()

    // Step 1: Serve from cache immediately
    if (userId) {
      const all = await localBooksDb.getAll(userId)
      const cached = all.find(b => b.id === id)
      if (cached) set({ currentBook: cached })
    }

    if (!isOnline) return

    // Step 2: Background refresh
    try {
      const { data } = await booksService.getBook(id)
      if (data) {
        set({ currentBook: data })
        // Also update the book in the list
        set(state => ({ books: state.books.map(b => b.id === id ? data : b) }))
        if (userId) await localBooksDb.upsert(userId, data)
      }
    } catch (e) {
      logger.warn('[Books] fetchBook exception:', e)
    }
  },

  // ── createBook ─────────────────────────────────────────────────
  createBook: async (formData) => {
    const userId = useAuthStore.getState().user?.id!
    const { isOnline, enqueue } = useOfflineStore.getState()
    const id = genTempId()
    const now = new Date().toISOString()

    const optimistic: Book = {
      id,
      name: formData.name.trim(),
      description: formData.description?.trim() || null,
      color: formData.color,
      currency: formData.currency,
      owner_id: userId,
      created_at: now,
      updated_at: now,
      role: 'owner',
      balance: 0,
      cash_in: 0,
      cash_out: 0,
      member_count: 1,
    }

    // Optimistic UI — show immediately
    set(state => ({ books: [optimistic, ...state.books] }))
    await localBooksDb.upsert(userId, optimistic)

    if (!isOnline) {
      await enqueue({ id: `op_${id}`, type: 'CREATE_BOOK', payload: { tempId: id, ...formData } })
      return { data: optimistic, error: null }
    }

    const { data, error } = await booksService.createBook(formData)
    if (error || !data) {
      // Online but request failed — queue for retry
      await enqueue({ id: `op_${id}`, type: 'CREATE_BOOK', payload: { tempId: id, ...formData } })
      return { data: optimistic, error: null }
    }

    // Replace optimistic with real server data
    const real = { ...data, role: 'owner' as const }
    set(state => ({ books: state.books.map(b => b.id === id ? real : b) }))
    await localBooksDb.upsert(userId, real)
    await localBooksDb.remove(userId, id)
    return { data: real, error: null }
  },

  // ── updateBook ─────────────────────────────────────────────────
  updateBook: async (id, formData) => {
    const userId = useAuthStore.getState().user?.id!
    const { isOnline, enqueue } = useOfflineStore.getState()

    // Optimistic update
    set(state => ({
      books: state.books.map(b => b.id === id ? { ...b, ...formData } : b),
      currentBook: state.currentBook?.id === id ? { ...state.currentBook, ...formData } : state.currentBook,
    }))
    if (userId) {
      const all = await localBooksDb.getAll(userId)
      await localBooksDb.save(userId, all.map(b => b.id === id ? { ...b, ...formData } : b))
    }

    if (!isOnline) {
      await enqueue({ id: `op_upd_${id}_${Date.now()}`, type: 'UPDATE_BOOK', payload: { bookId: id, ...formData } })
      return { error: null }
    }

    const { error } = await booksService.updateBook(id, formData)
    if (error) {
      await enqueue({ id: `op_upd_${id}_${Date.now()}`, type: 'UPDATE_BOOK', payload: { bookId: id, ...formData } })
    }
    return { error: null }
  },

  // ── deleteBook ─────────────────────────────────────────────────
  deleteBook: async (id) => {
    const userId = useAuthStore.getState().user?.id!
    const { isOnline, enqueue } = useOfflineStore.getState()

    // Optimistic remove
    set(state => ({ books: state.books.filter(b => b.id !== id) }))
    if (userId) await localBooksDb.remove(userId, id)

    if (!isOnline) {
      await enqueue({ id: `op_del_${id}`, type: 'DELETE_BOOK', payload: { bookId: id } })
      return { error: null }
    }

    const { error } = await booksService.deleteBook(id)
    if (error) {
      await enqueue({ id: `op_del_${id}`, type: 'DELETE_BOOK', payload: { bookId: id } })
    }
    return { error: null }
  },

  setCurrentBook: (book) => set({ currentBook: book }),
}))