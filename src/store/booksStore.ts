// src/store/booksStore.ts  (offline-first)
import { create } from 'zustand'
import type { Book, BookFormData } from '../types'
import { booksService } from '../services/booksService'
import { localBooksDb } from '../services/localDb'
import { useOfflineStore } from './offlineStore'
import { useAuthStore } from './authStore'

const genTempId = () => `local_${Date.now()}_${Math.random().toString(36).slice(2)}`

interface BooksState {
  books: Book[]
  isLoading: boolean
  error: string | null
  currentBook: Book | null
  fetchBooks: () => Promise<void>
  fetchBook: (id: string) => Promise<void>
  createBook: (formData: BookFormData) => Promise<{ error: string | null; book?: Book }>
  updateBook: (id: string, updates: Partial<BookFormData>) => Promise<{ error: string | null }>
  deleteBook: (id: string) => Promise<{ error: string | null }>
  setCurrentBook: (book: Book | null) => void
  updateBookBalance: (id: string, delta: { cash_in?: number; cash_out?: number }) => void
}

export const useBooksStore = create<BooksState>((set, get) => ({
  books: [],
  isLoading: false,
  error: null,
  currentBook: null,

  fetchBooks: async () => {
    const userId = useAuthStore.getState().user?.id
    set({ isLoading: true, error: null })
    const { isOnline } = useOfflineStore.getState()

    if (!isOnline) {
      const local = userId ? await localBooksDb.getAll(userId) : []
      set({ books: local, isLoading: false })
      return
    }

    const { data, error } = await booksService.getBooks()
    if (error) {
      // Graceful fallback to local cache
      const local = userId ? await localBooksDb.getAll(userId) : []
      set({ books: local.length ? local : [], isLoading: false, error })
      return
    }
    if (userId && data) await localBooksDb.save(userId, data)
    set({ books: data ?? [], isLoading: false, error: null })
  },

  fetchBook: async (id) => {
    const userId = useAuthStore.getState().user?.id
    const { isOnline } = useOfflineStore.getState()

    if (!isOnline) {
      const local = userId ? await localBooksDb.getAll(userId) : []
      const book = local.find(b => b.id === id)
      if (book) set({ currentBook: book })
      return
    }

    const { data } = await booksService.getBook(id)
    if (data) {
      set({ currentBook: data })
      set(state => ({ books: state.books.map(b => b.id === id ? data : b) }))
      if (userId) await localBooksDb.upsert(userId, data)
    }
  },

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

    // Optimistic UI
    set(state => ({ books: [optimistic, ...state.books] }))
    await localBooksDb.upsert(userId, optimistic)

    if (!isOnline) {
      await enqueue({
        id: `op_${id}`,
        type: 'CREATE_BOOK',
        payload: {
          tempId: id,
          name: optimistic.name,
          description: optimistic.description,
          color: optimistic.color,
          currency: optimistic.currency,
        },
      })
      return { error: null, book: optimistic }
    }

    const { data, error } = await booksService.createBook(formData)
    if (error) {
      set(state => ({ books: state.books.filter(b => b.id !== id) }))
      await localBooksDb.remove(userId, id)
      return { error }
    }

    const real: Book = { ...data!, role: 'owner', balance: 0, cash_in: 0, cash_out: 0, member_count: 1 }
    set(state => ({ books: state.books.map(b => b.id === id ? real : b) }))
    await localBooksDb.remove(userId, id)
    await localBooksDb.upsert(userId, real)
    return { error: null, book: real }
  },

  updateBook: async (id, updates) => {
    const userId = useAuthStore.getState().user?.id!
    const { isOnline, enqueue } = useOfflineStore.getState()
    const prev = get().books.find(b => b.id === id)

    // Optimistic
    set(state => ({
      books: state.books.map(b => b.id === id ? { ...b, ...updates } : b),
      currentBook: state.currentBook?.id === id
        ? { ...state.currentBook, ...updates }
        : state.currentBook,
    }))
    if (prev) await localBooksDb.upsert(userId, { ...prev, ...updates } as Book)

    if (!isOnline) {
      await enqueue({
        id: `op_upd_${id}_${Date.now()}`,
        type: 'UPDATE_BOOK',
        payload: { bookId: id, ...updates },
      })
      return { error: null }
    }

    const { error } = await booksService.updateBook(id, updates)
    if (error && prev) {
      set(state => ({ books: state.books.map(b => b.id === id ? prev : b) }))
      await localBooksDb.upsert(userId, prev)
    }
    return { error: error ?? null }
  },

  deleteBook: async (id) => {
    const userId = useAuthStore.getState().user?.id!
    const { isOnline, enqueue } = useOfflineStore.getState()
    const prev = get().books.find(b => b.id === id)

    set(state => ({ books: state.books.filter(b => b.id !== id) }))
    await localBooksDb.remove(userId, id)

    if (!isOnline) {
      await enqueue({ id: `op_del_${id}`, type: 'DELETE_BOOK', payload: { bookId: id } })
      return { error: null }
    }

    const { error } = await booksService.deleteBook(id)
    if (error && prev) {
      set(state => ({ books: [prev, ...state.books] }))
      await localBooksDb.upsert(userId, prev)
    }
    return { error: error ?? null }
  },

  setCurrentBook: (book) => set({ currentBook: book }),

  updateBookBalance: (id, delta) => {
    set(state => {
      const update = (book: Book): Book => {
        const newCashIn = (book.cash_in || 0) + (delta.cash_in || 0)
        const newCashOut = (book.cash_out || 0) + (delta.cash_out || 0)
        return { ...book, cash_in: newCashIn, cash_out: newCashOut, balance: newCashIn - newCashOut }
      }
      return {
        books: state.books.map(b => b.id === id ? update(b) : b),
        currentBook: state.currentBook?.id === id ? update(state.currentBook) : state.currentBook,
      }
    })
  },
}))
