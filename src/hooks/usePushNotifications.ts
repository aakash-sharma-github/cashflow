// src/hooks/usePushNotifications.ts
//
// Responsibilities:
//  1. Permission + push token registration (Expo push token via FCM)
//  2. GLOBAL realtime subscriptions that work regardless of which screen is open:
//     - Invitations addressed to this user
//     - Entry changes in ALL books this user is a member of
//  3. Badge management

import { useEffect, useRef } from 'react'
import { AppState, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { notificationService } from '../services/notificationService'
import { invitationsService } from '../services/invitationsService'
import { useAuthStore } from '../store/authStore'
import { useInboxStore } from '../store/inboxStore'
import { authService } from '../services/authService'
import { formatAmount } from '../utils'
import supabase from '../services/supabase'

// ── Push token registration ───────────────────────────────────
async function registerPushToken(userId: string): Promise<void> {
    if (!Device.isDevice) {
        console.log('[Push] Skipping token registration — not a real device')
        return
    }

    const granted = await notificationService.hasPermission()
    if (!granted) {
        console.log('[Push] Skipping token registration — no permission')
        return
    }

    try {
        // Get the EAS project ID from Expo Constants (reliable in all build types)
        // Falls back to app.json extra.eas.projectId
        const projectId =
            Constants.expoConfig?.extra?.eas?.projectId ??
            Constants.easConfig?.projectId

        if (!projectId || projectId === 'your-eas-project-id') {
            console.error(
                '[Push] ❌ EAS Project ID is not set!\n' +
                'Run: eas init   (in your project root)\n' +
                'This sets expo.extra.eas.projectId in app.json automatically.\n' +
                'Without it, push tokens are invalid and notifications will be silently dropped.'
            )
            return
        }

        const result = await Notifications.getExpoPushTokenAsync({ projectId })
        const token = result.data  // format: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxxxx]

        console.log('[Push] ✅ Push token obtained:', token.slice(0, 40) + '...')
        await authService.updateProfile({ push_token: token })
        console.log('[Push] ✅ Push token saved to Supabase profiles.push_token')
    } catch (e) {
        console.error(
            '[Push] ❌ getExpoPushTokenAsync failed.\n' +
            'Most likely cause: google-services.json missing from android/app/\n' +
            'Error:', String(e)
        )
    }
}

// ── Global entry subscription ─────────────────────────────────
// Subscribe to ALL books this user is a member of.
// This runs independently of which screen is open, so notifications
// fire even when the user is on HomeScreen or app is in background.
async function subscribeToAllBooks(
    userId: string,
    onEntryChange: (bookId: string, bookName: string, type: 'added' | 'edited' | 'deleted', amount: string, entryType?: string, note?: string, actorName?: string) => void
): Promise<() => void> {
    // Get all books this user is a member of
    const { data: memberships } = await supabase
        .from('book_members')
        .select('book_id, books(name)')
        .eq('user_id', userId)

    if (!memberships?.length) return () => { }

    const channels: ReturnType<typeof supabase.channel>[] = []

    for (const membership of memberships) {
        const bookId = membership.book_id
        const bookName = (membership.books as any)?.name ?? ''

        const channel = supabase
            .channel(`global_entries:${bookId}:${userId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'entries', filter: `book_id=eq.${bookId}` },
                async (payload) => {
                    // Skip if this user created the entry
                    if (payload.new.user_id === userId) return

                    // Get actor name
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('full_name, email')
                        .eq('id', payload.new.user_id)
                        .single()
                    const actorName = profile?.full_name || profile?.email || 'A member'

                    onEntryChange(bookId, bookName, 'added', formatAmount(payload.new.amount), payload.new.type, payload.new.note, actorName)
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'entries', filter: `book_id=eq.${bookId}` },
                async (payload) => {
                    if (payload.new.user_id === userId) return

                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('full_name, email')
                        .eq('id', payload.new.user_id)
                        .single()
                    const actorName = profile?.full_name || profile?.email || 'A member'

                    onEntryChange(bookId, bookName, 'edited', formatAmount(payload.new.amount), undefined, undefined, actorName)
                }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'entries', filter: `book_id=eq.${bookId}` },
                (payload) => {
                    if (payload.old.user_id === userId) return
                    onEntryChange(bookId, bookName, 'deleted', '', undefined, undefined, undefined)
                }
            )
            .subscribe((status) => {
                console.log(`[Push] Entry subscription for book "${bookName}":`, status)
            })

        channels.push(channel)
    }

    return () => channels.forEach(c => supabase.removeChannel(c))
}

// ── Hook ─────────────────────────────────────────────────────
export function usePushNotifications() {
    const { user, isAuthenticated } = useAuthStore()
    const { setUnreadCount, increment } = useInboxStore()
    const unsubEntryRef = useRef<(() => void) | null>(null)

    // Setup permission + register push token on login
    useEffect(() => {
        if (!isAuthenticated || !user?.id) return
        notificationService.setup().then((granted) => {
            if (granted) registerPushToken(user.id)
        }).catch(() => { })
    }, [isAuthenticated, user?.id])

    // Load initial unread invitation count
    useEffect(() => {
        if (!isAuthenticated || !user) return
        invitationsService.getMyInvitations().then(({ data }) => {
            setUnreadCount(data?.length ?? 0)
        })
    }, [isAuthenticated, user?.id])

    // Global invitation listener
    useEffect(() => {
        if (!isAuthenticated || !user?.email) return

        const channel = supabase
            .channel(`invitations:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'invitations',
                    filter: `invitee_email=eq.${user.email}`,
                },
                async (payload) => {
                    const { data } = await supabase
                        .from('invitations')
                        .select('*, book:books(id, name), inviter:profiles!invitations_inviter_id_fkey(full_name, email)')
                        .eq('id', payload.new.id)
                        .single()

                    const inviterName = data?.inviter?.full_name || data?.inviter?.email || 'Someone'
                    const bookName = data?.book?.name || 'a book'

                    increment()
                    await notificationService.sendInvitationNotification(inviterName, bookName)
                }
            )
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [isAuthenticated, user?.id, user?.email])

    // Global entry change listener — works on any screen, any time
    useEffect(() => {
        if (!isAuthenticated || !user?.id) return

        // Small delay to let auth settle before querying memberships
        const timer = setTimeout(async () => {
            const userId = user.id
            const unsub = await subscribeToAllBooks(userId, async (bookId, bookName, type, amount, entryType, note, actorName) => {
                if (type === 'added') {
                    await notificationService.sendEntryAddedNotification(bookName, amount, (entryType ?? 'cash_in') as any, note, actorName)
                } else if (type === 'edited') {
                    await notificationService.sendEntryEditedNotification(bookName, amount, actorName)
                } else {
                    await notificationService.sendEntryDeletedNotification(bookName, actorName)
                }
            })
            unsubEntryRef.current = unsub
        }, 1500)

        return () => {
            clearTimeout(timer)
            unsubEntryRef.current?.()
            unsubEntryRef.current = null
        }
    }, [isAuthenticated, user?.id])

    // Clear badge when app comes to foreground
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') notificationService.clearBadge().catch(() => { })
        })
        return () => sub.remove()
    }, [])

    // Reload inbox count on any foreground notification
    useEffect(() => {
        const unsub = notificationService.addForegroundListener(async () => {
            if (!user?.email) return
            const { data } = await invitationsService.getMyInvitations()
            setUnreadCount(data?.length ?? 0)
        })
        return unsub
    }, [user?.id])
}