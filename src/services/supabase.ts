// src/services/supabase.ts
// CRITICAL FIX: The previous ChunkedSecureStore.setItem() called removeItem()
// on itself BEFORE writing a short value. removeItem() reads SecureStore (async),
// meaning short values caused a redundant read on every write — acceptable.
// BUT the real freeze: if EXPO_PUBLIC_SUPABASE_URL or ANON_KEY is undefined
// (missing .env on device build), createClient crashes silently and the auth
// session read never resolves, leaving isLoading=true forever.
//
// Fix:
// 1. Hard-fail fast with a clear error if env vars are missing
// 2. Add per-operation timeout to ChunkedSecureStore so a bad SecureStore
//    keychain state (corrupted, locked) can't hang initialize() forever
// 3. setItem for short values no longer calls removeItem first

import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

// Crash loudly at startup rather than silently hanging
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[CashFlow] Missing Supabase environment variables.\n' +
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set.\n' +
    'Copy .env.example to .env and fill in your values.'
  )
}

const CHUNK_SIZE = 1800
const CHUNK_META_SUFFIX = '__chunks'

// Wrap any SecureStore call with a timeout so a locked/corrupt keychain
// doesn't freeze the app on first launch
function withTimeout<T>(promise: Promise<T>, ms = 3000, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    try {
      const meta = await withTimeout(
        SecureStore.getItemAsync(key + CHUNK_META_SUFFIX),
        3000, null
      )
      if (meta) {
        const chunkCount = parseInt(meta, 10)
        if (isNaN(chunkCount) || chunkCount <= 0) return null
        let value = ''
        for (let i = 0; i < chunkCount; i++) {
          const chunk = await withTimeout(
            SecureStore.getItemAsync(`${key}_chunk_${i}`),
            3000, null
          )
          if (chunk === null) return null
          value += chunk
        }
        return value
      }
      return await withTimeout(SecureStore.getItemAsync(key), 3000, null)
    } catch {
      return null
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (value.length <= CHUNK_SIZE) {
        // Short value — write directly, no cleanup needed first
        await withTimeout(SecureStore.setItemAsync(key, value), 3000, undefined)
        return
      }
      // Large value — chunk it
      const chunks: string[] = []
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE))
      }
      // Remove old direct key if present
      try { await SecureStore.deleteItemAsync(key) } catch { }
      // Write chunks
      for (let i = 0; i < chunks.length; i++) {
        await withTimeout(
          SecureStore.setItemAsync(`${key}_chunk_${i}`, chunks[i]),
          3000, undefined
        )
      }
      await withTimeout(
        SecureStore.setItemAsync(key + CHUNK_META_SUFFIX, String(chunks.length)),
        3000, undefined
      )
    } catch (e) {
      console.warn('[SecureStore] setItem failed:', e)
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const meta = await withTimeout(
        SecureStore.getItemAsync(key + CHUNK_META_SUFFIX),
        2000, null
      )
      if (meta) {
        const chunkCount = parseInt(meta, 10)
        if (!isNaN(chunkCount)) {
          for (let i = 0; i < chunkCount; i++) {
            try { await SecureStore.deleteItemAsync(`${key}_chunk_${i}`) } catch { }
          }
        }
        try { await SecureStore.deleteItemAsync(key + CHUNK_META_SUFFIX) } catch { }
      }
      try { await SecureStore.deleteItemAsync(key) } catch { }
    } catch { }
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ChunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

export default supabase