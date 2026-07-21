// src/hooks/usePushNotifications.ts
//
// Responsibilities:
//  1. Permission + push token registration via Expo Push Token
//     (no google-services.json needed on server side —
//      FCM credentials are uploaded to Expo EAS once via:
//        eas credentials → Android → FCM API Key)
//  2. Global invitation listener — fires local notification
//     when this user is invited to a book
//  3. Badge management when app comes to foreground
//
// NOTE: Entry change notifications (added/updated/deleted) are
// handled by TWO layers:
//   - OPEN APP: useEntriesRealtime.ts fires local notification
//   - CLOSED APP: Postgres trigger → pgmq → pg_net → Expo Push API
//
// Both layers use the same notification content so the user
// experience is consistent regardless of app state.

import { useEffect } from 'react'
import { AppState } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { notificationService } from '../services/notificationService'
import { invitationsService } from '../services/invitationsService'
import { useAuthStore } from '../store/authStore'
import { useInboxStore } from '../store/inboxStore'
import { authService } from '../services/authService'
import supabase from '../services/supabase'
import { logger } from '../utils/logger'

// ── Push token registration ───────────────────────────────────
// Registers an ExponentPushToken with Expo's push service.
// Expo handles the FCM/APNs delivery behind the scenes.
// The token is saved to profiles.push_token in Supabase so the
// pgmq trigger can look it up when sending push notifications.
async function registerPushToken(userId: string): Promise<void> {
  if (!Device.isDevice) {
    logger.info('[Push] Skipping token registration — not a real device')
    return
  }

  const granted = await notificationService.hasPermission()
  if (!granted) {
    logger.info('[Push] Skipping token registration — no permission')
    return
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId

    if (!projectId || projectId === 'your-eas-project-id') {
      logger.error(
        '[Push] ❌ EAS Project ID not set.\n' +
        'Run: eas init\n' +
        'This writes expo.extra.eas.projectId in app.json.'
      )
      return
    }

    const result = await Notifications.getExpoPushTokenAsync({ projectId })
    const token = result.data  // ExponentPushToken[xxxx...]

    logger.info('[Push] ✅ Token obtained:', token.slice(0, 42) + '...')

    // Use SECURITY DEFINER RPC to save push token — bypasses RLS timing issues
    // where getUser() succeeds but the JWT in the client may be stale
    // Retry token save up to 3 times with 2s delays
    // The Supabase client may not have set JWT headers yet on first call
    let saved = false
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error: rpcError } = await supabase.rpc('save_push_token', { p_token: token })
      if (!rpcError) {
        logger.info('[Push] ✅ Token saved to profiles.push_token via RPC (attempt', attempt, ')')
        saved = true
        break
      }
      logger.warn('[Push] save_push_token attempt', attempt, 'failed:', rpcError.message)
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000))
    }
    if (!saved) {
      // Final fallback: direct update
      await authService.updateProfile({ push_token: token })
    }
  } catch (e) {
    logger.error(
      '[Push] ❌ getExpoPushTokenAsync failed.\n' +
      'If you see FCM credential errors, run:\n' +
      '  eas credentials (Android → FCM API Key → upload your server key)\n' +
      'Error:', String(e)
    )
  }
}

// ── Hook ──────────────────────────────────────────────────────
export function usePushNotifications() {
  const { user, isAuthenticated } = useAuthStore()
  const { setUnreadCount, increment } = useInboxStore()

  // Permission + token registration on login
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return
    notificationService.setup()
      .then(granted => { if (granted) registerPushToken(user.id) })
      .catch(() => { })
  }, [isAuthenticated, user?.id])

  // Load initial unread invitation count for badge
  useEffect(() => {
    if (!isAuthenticated || !user) return
    invitationsService.getMyInvitations().then(({ data }) => {
      setUnreadCount(data?.length ?? 0)
    })
  }, [isAuthenticated, user?.id])

  // Global invitation listener — fires local notification when
  // this user receives an invitation (app open or backgrounded)
  useEffect(() => {
    if (!isAuthenticated || !user?.email) return

    const channel = supabase
      .channel(`invitations:user:${user.id}`)
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
            .select('*, book:books(name), inviter:profiles!invitations_inviter_id_fkey(full_name, email)')
            .eq('id', payload.new.id)
            .single()

          const inviterName = (data?.inviter as any)?.full_name
            || (data?.inviter as any)?.email
            || 'Someone'
          const bookName = (data?.book as any)?.name || 'a book'

          increment()
          await notificationService.sendInvitationNotification(inviterName, bookName)
        }
      )
      .subscribe((status) => {
        logger.info('[Push] Invitation subscription:', status)
      })

    return () => { supabase.removeChannel(channel) }
  }, [isAuthenticated, user?.id, user?.email])

  // Clear badge + dismiss notifications when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        notificationService.clearBadge().catch(() => { })
      }
    })
    return () => sub.remove()
  }, [])

  // Refresh inbox badge on any foreground notification
  useEffect(() => {
    const unsub = notificationService.addForegroundListener(async () => {
      if (!user?.email) return
      const { data } = await invitationsService.getMyInvitations()
      setUnreadCount(data?.length ?? 0)
    })
    return unsub
  }, [user?.id])

  // Handle notification TAP — navigate to the relevant screen
  // Uses Notifications.useLastNotificationResponse() pattern to also handle
  // taps that launched the app from a killed state
  useEffect(() => {
    // Listener for taps while app is open or backgrounded
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any
      handleNotificationNavigation(data)
    })
    return () => sub.remove()
  }, [isAuthenticated])

  // Handle tap that cold-launched the app (app was killed)
  useEffect(() => {
    if (!isAuthenticated) return
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return
      const data = response.notification.request.content.data as any
      // Small delay to let navigation stack initialize
      setTimeout(() => handleNotificationNavigation(data), 500)
    })
  }, [isAuthenticated])
}

// Navigate based on notification data payload
function handleNotificationNavigation(data: any) {
  if (!data) return
  const type = data.type as string
  const bookId = data.bookId as string | undefined

  try {
    // Import navigationRef lazily to avoid circular dependency
    const { navigationRef } = require('../navigation')
    if (!navigationRef?.current?.isReady?.()) return

    if ((type === 'entry_added' || type === 'entry_updated' || type === 'entry_deleted') && bookId) {
      // Navigate to the book so user can see the entry change
      navigationRef.current.navigate('BookDetail', { bookId })
    } else if (type === 'invitation') {
      // Navigate to notifications/inbox screen
      navigationRef.current.navigate('Notifications')
    }
  } catch {
    // Navigation not ready — ignore
  }
}