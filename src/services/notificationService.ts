// src/services/notificationService.ts
// CRITICAL FIX: Notifications.setNotificationHandler() is called at module
// import time (top level). If expo-notifications is not fully initialized
// when the JS bundle first runs (happens on some Android versions), this
// throws and crashes the entire module — which crashes App.tsx import chain
// → blank/frozen splash.
//
// Fix: wrap setNotificationHandler in try/catch and defer to useEffect.
// Also: getExpoPushTokenAsync() with an undefined projectId throws on device
// builds — added guard.

import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import supabase from './supabase'

// Safe top-level call — won't crash if notifications module isn't ready
try {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
        }),
    })
} catch (e) {
    console.warn('[Notifications] setNotificationHandler failed:', e)
}

export const notificationService = {
    async registerForPushNotifications(): Promise<string | null> {
        try {
            if (!Device.isDevice) {
                console.log('[Push] Not a physical device — skipping')
                return null
            }

            const { status: existingStatus } = await Notifications.getPermissionsAsync()
            let finalStatus = existingStatus

            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync()
                finalStatus = status
            }

            if (finalStatus !== 'granted') {
                console.log('[Push] Permission not granted')
                return null
            }

            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('invitations', {
                    name: 'Invitations',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#5B5FED',
                })
            }

            // projectId is REQUIRED for getExpoPushTokenAsync on device builds
            const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID
            if (!projectId) {
                console.warn('[Push] EXPO_PUBLIC_EAS_PROJECT_ID not set — skipping token fetch')
                return null
            }

            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId })
            const token = tokenData.data

            // Save token to profile
            const { data: { user } } = await supabase.auth.getUser()
            if (user && token) {
                await supabase.from('profiles').update({ push_token: token }).eq('id', user.id)
            }

            return token
        } catch (e) {
            // Never crash the app over push registration failure
            console.warn('[Push] registerForPushNotifications error:', e)
            return null
        }
    },

    async sendLocalInvitationNotification(inviterName: string, bookName: string) {
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '📬 New Invitation',
                    body: `${inviterName} invited you to "${bookName}"`,
                    data: { type: 'invitation' },
                    sound: true,
                },
                trigger: null,
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

    async clearBadge() {
        try {
            await Notifications.setBadgeCountAsync(0)
            await Notifications.dismissAllNotificationsAsync()
        } catch { }
    },
}