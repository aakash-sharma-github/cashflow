// src/services/supabase.ts
// Fix for Issue #3: Supabase session JSON exceeds SecureStore's 2048-byte limit.
// Solution: chunk large values across multiple SecureStore keys.

import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// SecureStore max value size is 2048 bytes.
// Supabase session tokens exceed this. We chunk large values.
const CHUNK_SIZE = 1800 // stay safely under 2048
const CHUNK_META_SUFFIX = '__chunks'

const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    try {
      // Check if this value was chunked
      const meta = await SecureStore.getItemAsync(key + CHUNK_META_SUFFIX)
      if (meta) {
        const chunkCount = parseInt(meta, 10)
        let value = ''
        for (let i = 0; i < chunkCount; i++) {
          const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`)
          if (chunk === null) return null
          value += chunk
        }
        return value
      }
      // Not chunked — read directly
      return await SecureStore.getItemAsync(key)
    } catch {
      return null
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (value.length <= CHUNK_SIZE) {
        // Clean up any old chunks from a previous large value
        await ChunkedSecureStore.removeItem(key)
        await SecureStore.setItemAsync(key, value)
        return
      }

      // Split into chunks
      const chunks: string[] = []
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE))
      }

      // Remove any old direct value
      try { await SecureStore.deleteItemAsync(key) } catch {}

      // Write chunks
      for (let i = 0; i < chunks.length; i++) {
        await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunks[i])
      }
      // Write chunk count as metadata
      await SecureStore.setItemAsync(key + CHUNK_META_SUFFIX, String(chunks.length))
    } catch (e) {
      console.warn('[SecureStore] setItem failed:', e)
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      // Remove chunks if they exist
      const meta = await SecureStore.getItemAsync(key + CHUNK_META_SUFFIX)
      if (meta) {
        const chunkCount = parseInt(meta, 10)
        for (let i = 0; i < chunkCount; i++) {
          try { await SecureStore.deleteItemAsync(`${key}_chunk_${i}`) } catch {}
        }
        try { await SecureStore.deleteItemAsync(key + CHUNK_META_SUFFIX) } catch {}
      }
      // Also try to remove direct value
      try { await SecureStore.deleteItemAsync(key) } catch {}
    } catch {}
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
