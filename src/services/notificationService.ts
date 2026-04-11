// src/services/notificationService.ts
// FIREBASE FIX: expo-notifications on Android uses FCM (Firebase Cloud Messaging)
// for REMOTE push tokens. If google-services.json is not configured, calling
// getExpoPushTokenAsync() throws "FirebaseApp is not initialized".
//
// Solution: Use LOCAL notifications only (no Firebase required).
// Local notifications work on any device without any Firebase setup.
// They fire immediately and show a system notification — perfect for
// "you received an invitation" alerts triggered by our Supabase realtime hook.
//
// Remote push (server → device when app is closed) is a Phase 2 feature
// that requires adding google-services.json to the build.

import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

// Safe top-level handler setup
try {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
        }),
    })
} catch (e) {
    console.warn('[Notifications] handler setup failed:', e)
}

export const notificationService = {
    /**
     * Request notification permission and set up Android channel.
     * Does NOT call getExpoPushTokenAsync — avoids Firebase requirement.
     * Returns true if permission granted.
     */
    async setup(): Promise<boolean> {
        try {
            if (!Device.isDevice) {
                // console.log('[Push] Emulator — notifications limited')
                return false
            }

            // Android: create notification channel first
            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('invitations', {
                    name: 'Invitations',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#5B5FED',
                    sound: 'default',
                })
            }

            const { status: existing } = await Notifications.getPermissionsAsync()
            if (existing === 'granted') return true

            const { status } = await Notifications.requestPermissionsAsync()
            return status === 'granted'
        } catch (e) {
            console.warn('[Push] setup error:', e)
            return false
        }
    },

    /**
     * Show a local notification immediately.
     * Works without Firebase / google-services.json.
     */
    async sendLocalInvitationNotification(inviterName: string, bookName: string): Promise<void> {
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '📬 New Invitation',
                    body: `${inviterName} invited you to "${bookName}"`,
                    data: { type: 'invitation' },
                    sound: 'default',
                    // Android-specific channel
                    ...(Platform.OS === 'android' && { channelId: 'invitations' }),
                },
                trigger: null, // fire immediately
            })
        } catch (e) {
            console.warn('[Push] sendLocalNotification error:', e)
        }
    },

    addForegroundListener(callback: (n: Notifications.Notification) => void) {
        try {
            const sub = Notifications.addNotificationReceivedListener(callback)
            return () => sub.remove()
        } catch {
            return () => { }
        }
    },

    addResponseListener(callback: (r: Notifications.NotificationResponse) => void) {
        try {
            const sub = Notifications.addNotificationResponseReceivedListener(callback)
            return () => sub.remove()
        } catch {
            return () => { }
        }
    },

    async clearBadge(): Promise<void> {
        try {
            await Notifications.setBadgeCountAsync(0)
            await Notifications.dismissAllNotificationsAsync()
        } catch { }
    },
}