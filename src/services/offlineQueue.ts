import type { OperationType, PendingOperation } from '../store/offlineStore'

function bookRef(op: PendingOperation): string | undefined {
  const p = op.payload
  const ref = p.book_id ?? p.bookId ?? p.serverId ?? p.tempBookId ?? p.tempId
  return ref == null ? undefined : `${op.userId ?? 'legacy'}:${ref}`
}

function entryRef(op: PendingOperation): string | undefined {
  const p = op.payload
  const ref = p.entryId ?? p.entry_id ?? p.tempId ?? p.serverId
  return ref == null ? undefined : `${op.userId ?? 'legacy'}:${ref}`
}

function mergePayload(base: Record<string, any>, update: Record<string, any>) {
  const { bookId: _bookId, book_id: _book_id, entryId: _entryId, entry_id: _entry_id, ...fields } = update
  return { ...base, ...fields }
}

/** Collapse dependent local edits while preserving the order of independent work. */
export function compactOfflineQueue(input: PendingOperation[]): PendingOperation[] {
  const queue: PendingOperation[] = []

  for (const original of input) {
    const op: PendingOperation = { ...original, payload: { ...original.payload } }

    if (op.type === 'UPDATE_BOOK') {
      const ref = bookRef(op)
      const create = queue.find(item => item.type === 'CREATE_BOOK' && bookRef(item) === ref)
      if (create) { create.payload = mergePayload(create.payload, op.payload); continue }
      const previous = [...queue].reverse().find(item => item.type === 'UPDATE_BOOK' && bookRef(item) === ref)
      if (previous) { previous.payload = mergePayload(previous.payload, op.payload); previous.createdAt = op.createdAt }
      else queue.push(op)
      continue
    }

    if (op.type === 'DELETE_BOOK') {
      const ref = bookRef(op)
      const createIndex = queue.findIndex(item => item.type === 'CREATE_BOOK' && bookRef(item) === ref)
      if (createIndex >= 0) {
        const create = queue[createIndex]
        if (create.payload.attemptedOnline) {
          for (let i = queue.length - 1; i >= 0; i--) if (i !== createIndex && bookRef(queue[i]) === ref) queue.splice(i, 1)
          queue.push(op)
        } else {
          const canceledEntryIds = new Set(queue.filter(item => item.type === 'CREATE_ENTRY' && bookRef(item) === ref).map(item => item.payload.tempId as string))
          for (let i = queue.length - 1; i >= 0; i--) {
            const item = queue[i]
            if (bookRef(item) === ref || canceledEntryIds.has(entryRef(item) ?? '')) queue.splice(i, 1)
          }
        }
        continue
      }
      for (let i = queue.length - 1; i >= 0; i--) if (bookRef(queue[i]) === ref) queue.splice(i, 1)
      queue.push(op)
      continue
    }

    if (op.type === 'UPDATE_ENTRY') {
      const ref = entryRef(op)
      const create = queue.find(item => item.type === 'CREATE_ENTRY' && entryRef(item) === ref)
      if (create) { create.payload = mergePayload(create.payload, op.payload); continue }
      const previous = [...queue].reverse().find(item => item.type === 'UPDATE_ENTRY' && entryRef(item) === ref)
      if (previous) { previous.payload = mergePayload(previous.payload, op.payload); previous.createdAt = op.createdAt }
      else queue.push(op)
      continue
    }

    if (op.type === 'DELETE_ENTRY') {
      const ref = entryRef(op)
      const createIndex = queue.findIndex(item => item.type === 'CREATE_ENTRY' && entryRef(item) === ref)
      if (createIndex >= 0) {
        const create = queue[createIndex]
        if (create.payload.attemptedOnline) {
          for (let i = queue.length - 1; i >= 0; i--) if (i !== createIndex && entryRef(queue[i]) === ref) queue.splice(i, 1)
          queue.push(op)
        } else {
          for (let i = queue.length - 1; i >= 0; i--) {
            const item = queue[i]
            if ((item.type === 'CREATE_ENTRY' && entryRef(item) === ref) ||
                ((item.type === 'UPDATE_ENTRY' || item.type === 'DELETE_ENTRY') && entryRef(item) === ref)) queue.splice(i, 1)
          }
        }
        continue
      }
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].type === 'UPDATE_ENTRY' && entryRef(queue[i]) === ref) queue.splice(i, 1)
      if (!queue.some(item => item.type === 'DELETE_ENTRY' && entryRef(item) === ref)) queue.push(op)
      continue
    }

    queue.push(op)
  }

  return queue
}

export function operationEntityRef(type: OperationType, payload: Record<string, any>): string | undefined {
  if (type.endsWith('_BOOK')) return payload.bookId ?? payload.book_id ?? payload.serverId ?? payload.tempId
  return payload.entryId ?? payload.entry_id ?? payload.serverId ?? payload.tempId
}
