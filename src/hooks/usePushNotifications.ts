// src/hooks/usePushNotifications.ts
// Handles:
//   1. Notification permission setup
//   2. Expo/FCM push token registration → saved to profiles.push_token
//   3. Realtime invitation listener → local notification
//   4. Badge management
//
// FCM tokens are obtained via Notifications.getDevicePushTokenAsync()
// after google-services.json is added. Until then, getExpoPushTokenAsync()
// is used as a fallback (works in Expo Go and for local notifications).

import { useEffect, useRef } from 'react'
import { AppState, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { notificationService } from '../services/notificationService'
import { invitationsService } from '../services/invitationsService'
import { useAuthStore } from '../store/authStore'
import { useInboxStore } from '../store/inboxStore'
import { authService } from '../services/authService'
import supabase from '../services/supabase'

async function registerPushToken(userId: string): Promise<void> {
    if (!Device.isDevice) return

    try {
        const granted = await notificationService.hasPermission()
        if (!granted) return

        // Use Expo Push Token — works with both FCM (Android) and APNs (iOS).
        // Expo's push service acts as a proxy, routing to FCM/APNs automatically.
        // This requires:
        //   Android: google-services.json placed at android/app/google-services.json
        //   iOS: APNs key uploaded in EAS credentials
        // Without google-services.json, this call throws — we catch it silently.
        try {
            const result = await Notifications.getExpoPushTokenAsync({
                projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
            })
            const token = result.data  // format: ExponentPushToken[xxxx]
            if (token) {
                await authService.updateProfile({ push_token: token })
                console.log('[Push] Expo push token registered:', token.slice(0, 30) + '...')
            }
        } catch (e) {
            // Firebase/APNs not configured yet — local notifications still work
            console.log('[Push] Push token registration skipped (Firebase not configured):', String(e).slice(0, 80))
        }
    } catch { }
}

export function usePushNotifications() {
    const { user, isAuthenticated } = useAuthStore()
    const { setUnreadCount, increment } = useInboxStore()
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

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

    // Realtime: listen for new invitations addressed to this user's email
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
                        .select('*, book:books(id, name, color), inviter:profiles!invitations_inviter_id_fkey(full_name, email)')
                        .eq('id', payload.new.id)
                        .single()

                    const inviterName = data?.inviter?.full_name || data?.inviter?.email || 'Someone'
                    const bookName = data?.book?.name || 'a book'

                    increment()
                    await notificationService.sendInvitationNotification(inviterName, bookName)
                }
            )
            .subscribe()

        channelRef.current = channel
        return () => { supabase.removeChannel(channel) }
    }, [isAuthenticated, user?.id, user?.email])

    // Clear badge when app comes to foreground
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') notificationService.clearBadge().catch(() => { })
        })
        return () => sub.remove()
    }, [])

    // Reload inbox count when a foreground notification arrives
    useEffect(() => {
        const unsub = notificationService.addForegroundListener(async () => {
            if (!user?.email) return
            const { data } = await invitationsService.getMyInvitations()
            setUnreadCount(data?.length ?? 0)
        })
        return unsub
    }, [user?.id])
}