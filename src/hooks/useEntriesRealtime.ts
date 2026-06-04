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
            // NOTE: We do NOT send a local notification for UPDATE events.
            // data.user_id is the entry CREATOR, not who edited it — we can't
            // reliably tell if the current user is the editor from this payload.
            // The server-side pgmq trigger uses auth.uid() and handles this correctly.
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
          // NOTE: We do NOT send a local notification for DELETE events.
          // Reason 1: payload.old.user_id is the entry CREATOR, not who deleted it.
          //           We cannot know from the client payload who performed the delete.
          // Reason 2: The server-side pgmq trigger uses auth.uid() (actual deleter)
          //           and sends the correct push notification to other members.
          // Sending a local notification here would cause the deleter to receive
          // a notification about their own deletion.
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