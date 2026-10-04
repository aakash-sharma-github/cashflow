import * as Crypto from 'expo-crypto'

/** A persisted UUID used only as an idempotency key and client-selected row ID. */
export function createSyncId(): string {
  return Crypto.randomUUID()
}
