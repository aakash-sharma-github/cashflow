// src/hooks/useEntriesRealtime.ts
import { useEffect, useRef } from 'react'
import supabase from '../services/supabase'
import { useEntriesStore } from '../store/entriesStore'
import { useAuthStore } from '../store/authStore'
import { useBooksStore } from '../store/booksStore'
import type { Entry } from '../types'
import { notificationService } from '../services/notificationService'
import { formatAmount } from '../utils'

/**
 * Subscribes to real-time changes for entries in a specific book.
 * Automatically updates the entries store when changes come in from other users.
 */
export function useEntriesRealtime(bookId: string, bookName?: string) {
  const addEntry = useEntriesStore(s => s.addEntryFromRealtime)
  const updateEntry = useEntriesStore(s => s.updateEntryFromRealtime)
  const removeEntry = useEntriesStore(s => s.removeEntryFromRealtime)
  const fetchBook = useBooksStore(s => s.fetchBook)
  // Used to suppress notifications for the entry creator — only collaborators get notified
  const currentUserId = useAuthStore(s => s.user?.id)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!bookId) return

    const channel = supabase
      .channel(`entries:${bookId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'entries',
          filter: `book_id=eq.${bookId}`,
        },
        async (payload) => {
          // Fetch full entry with profile join
          const { data } = await supabase
            .from('entries')
            .select('*, profile:profiles(id, email, full_name)')
            .eq('id', payload.new.id)
            .single()

          if (data) {
            addEntry(data as Entry)
            // Only notify if the entry was created by ANOTHER user (not the current user)
            if (data.user_id !== currentUserId) {
              const amt = formatAmount(data.amount)
              const addedBy = data.profile?.full_name || data.profile?.email
              notificationService.sendEntryAddedNotification(
                bookName ?? '',
                amt,
                data.type,
                data.note ?? undefined,
                addedBy,
              )
            }
          }
          fetchBook(bookId)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'entries',
          filter: `book_id=eq.${bookId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('entries')
            .select('*, profile:profiles(id, email, full_name)')
            .eq('id', payload.new.id)
            .single()

          if (data) {
            updateEntry(data as Entry)
            // Only notify collaborators — skip if current user made this edit
            if (data.user_id !== currentUserId) {
              const editedBy = data.profile?.full_name || data.profile?.email
              notificationService.sendEntryEditedNotification(bookName ?? '', formatAmount(data.amount), editedBy)
            }
          }
          fetchBook(bookId)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'entries',
          filter: `book_id=eq.${bookId}`,
        },
        (payload) => {
          removeEntry(payload.old.id)
          // Only notify if it was a collaborator's entry being deleted
          // (identified by entry's original creator, not necessarily who deleted it)
          if (payload.old.user_id && payload.old.user_id !== currentUserId) {
            notificationService.sendEntryDeletedNotification(bookName ?? '')
          }
          fetchBook(bookId)
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [bookId])
}

/**
 * Subscribe to book member changes (join/leave events)
 */
export function useBookMembersRealtime(bookId: string, onMemberChange?: () => void) {
  useEffect(() => {
    if (!bookId) return

    const channel = supabase
      .channel(`book_members:${bookId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'book_members',
          filter: `book_id=eq.${bookId}`,
        },
        () => {
          onMemberChange?.()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [bookId, onMemberChange])
}