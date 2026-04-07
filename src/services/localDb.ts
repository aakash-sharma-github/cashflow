// src/services/localDb.ts
// Local storage layer for offline-first support.
// Mirrors the shape of the remote DB but stored in AsyncStorage.
// Data is keyed by entity type + user ID to support multi-user devices.

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Book, Entry } from '../types'

const key = (namespace: string, userId: string) => `cashflow:${namespace}:${userId}`

// ─── Books ──────────────────────────────────────────────────

export const localBooksDb = {
  async getAll(userId: string): Promise<Book[]> {
    try {
      const raw = await AsyncStorage.getItem(key('books', userId))
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  },

  async save(userId: string, books: Book[]): Promise<void> {
    await AsyncStorage.setItem(key('books', userId), JSON.stringify(books))
  },

  async upsert(userId: string, book: Book): Promise<void> {
    const all = await localBooksDb.getAll(userId)
    const idx = all.findIndex(b => b.id === book.id)
    if (idx >= 0) all[idx] = book
    else all.unshift(book)
    await localBooksDb.save(userId, all)
  },

  async remove(userId: string, bookId: string): Promise<void> {
    const all = await localBooksDb.getAll(userId)
    await localBooksDb.save(userId, all.filter(b => b.id !== bookId))
  },
}

// ─── Entries ─────────────────────────────────────────────────

export const localEntriesDb = {
  async getByBook(userId: string, bookId: string): Promise<Entry[]> {
    try {
      const raw = await AsyncStorage.getItem(key(`entries:${bookId}`, userId))
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  },

  async save(userId: string, bookId: string, entries: Entry[]): Promise<void> {
    await AsyncStorage.setItem(key(`entries:${bookId}`, userId), JSON.stringify(entries))
  },

  async upsert(userId: string, bookId: string, entry: Entry): Promise<void> {
    const all = await localEntriesDb.getByBook(userId, bookId)
    const idx = all.findIndex(e => e.id === entry.id)
    if (idx >= 0) all[idx] = entry
    else all.unshift(entry)
    // Sort by entry_date desc
    all.sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())
    await localEntriesDb.save(userId, bookId, all)
  },

  async remove(userId: string, bookId: string, entryId: string): Promise<void> {
    const all = await localEntriesDb.getByBook(userId, bookId)
    await localEntriesDb.save(userId, bookId, all.filter(e => e.id !== entryId))
  },

  async clearBook(userId: string, bookId: string): Promise<void> {
    await AsyncStorage.removeItem(key(`entries:${bookId}`, userId))
  },
}

// ─── Metadata ─────────────────────────────────────────────────

export const localMetaDb = {
  async getLastSync(userId: string): Promise<string | null> {
    return AsyncStorage.getItem(key('last_sync', userId))
  },
  async setLastSync(userId: string, ts: string): Promise<void> {
    await AsyncStorage.setItem(key('last_sync', userId), ts)
  },
  async clearAll(userId: string): Promise<void> {
    const books = await localBooksDb.getAll(userId)
    const keys = [
      key('books', userId),
      key('last_sync', userId),
      ...books.map(b => key(`entries:${b.id}`, userId)),
    ]
    await AsyncStorage.multiRemove(keys)
  },
}
