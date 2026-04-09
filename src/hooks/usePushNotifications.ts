// src/hooks/usePushNotifications.ts
// Registers for push, wires up realtime invitation listener,
// fires local notification when a new invite arrives.
// Mount once in App.tsx after authentication.
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { notificationService } from '../services/notificationService'
import { invitationsService } from '../services/invitationsService'
import { useAuthStore } from '../store/authStore'
import { useInboxStore } from '../store/inboxStore'
import supabase from '../services/supabase'

export function usePushNotifications() {
    const { user, isAuthenticated } = useAuthStore()
    const { setUnreadCount, increment } = useInboxStore()
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

    // Register device on login
    useEffect(() => {
        if (!isAuthenticated || !user) return
        notificationService.registerForPushNotifications().catch(console.error)
    }, [isAuthenticated, user?.id])

    // Load initial unread count
    useEffect(() => {
        if (!isAuthenticated || !user) return
        const loadCount = async () => {
            const { data } = await invitationsService.getMyInvitations()
            setUnreadCount(data?.length ?? 0)
        }
        loadCount()
    }, [isAuthenticated, user?.id])

    // Realtime: subscribe to new invitations directed at this user's email
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
                    // Fetch the full invitation with book + inviter info
                    const { data } = await supabase
                        .from('invitations')
                        .select('*, book:books(id, name, color), inviter:profiles!invitations_inviter_id_fkey(full_name, email)')
                        .eq('id', payload.new.id)
                        .single()

                    const inviterName = data?.inviter?.full_name || data?.inviter?.email || 'Someone'
                    const bookName = data?.book?.name || 'a book'

                    // Increment badge
                    increment()

                    // Fire local notification
                    await notificationService.sendLocalInvitationNotification(inviterName, bookName)
                }
            )
            .subscribe()

        channelRef.current = channel

        return () => {
            supabase.removeChannel(channel)
        }
    }, [isAuthenticated, user?.id, user?.email])

    // Clear badge when app comes to foreground
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                notificationService.clearBadge().catch(() => { })
            }
        })
        return () => sub.remove()
    }, [])

    // Foreground notification handler — reload inbox count
    useEffect(() => {
        const unsub = notificationService.addForegroundListener(async () => {
            if (!user?.email) return
            const { data } = await invitationsService.getMyInvitations()
            setUnreadCount(data?.length ?? 0)
        })
        return unsub
    }, [user?.id])
}