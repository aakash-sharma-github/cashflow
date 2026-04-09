// src/services/notificationService.ts
// Handles Expo Push Notifications registration and sending.
// Uses Expo's free push notification infrastructure.
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import supabase from './supabase'

// Configure how notifications appear when the app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true, //added for Android 13+
        shouldShowList: true,
    }),
})

export const notificationService = {
    /**
     * Register for push notifications and save the token to the user's profile.
     * Call once after login.
     */
    async registerForPushNotifications(): Promise<string | null> {
        if (!Device.isDevice) {
            // Push notifications don't work in simulator/emulator
            // console.log('[Push] Not a physical device — skipping push registration')
            return null
        }

        // Check / request permission
        const { status: existingStatus } = await Notifications.getPermissionsAsync()
        let finalStatus = existingStatus

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync()
            finalStatus = status
        }

        if (finalStatus !== 'granted') {
            // console.log('[Push] Permission denied')
            return null
        }

        // Android requires a notification channel
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('invitations', {
                name: 'Invitations',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#5B5FED',
            })
        }

        // Get the Expo push token
        const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
        })
        const token = tokenData.data

        // Persist to Supabase profile so the invite sender can target it
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            await supabase
                .from('profiles')
                .update({ push_token: token })
                .eq('id', user.id)
        }

        return token
    },

    /**
     * Send a local push notification (used when invitation arrives via realtime).
     */
    async sendLocalInvitationNotification(inviterName: string, bookName: string) {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: '📬 New Invitation',
                body: `${inviterName} invited you to "${bookName}"`,
                data: { type: 'invitation' },
                sound: true,
            },
            trigger: null, // fire immediately
        })
    },

    /**
     * Listen for incoming notifications while the app is open.
     * Returns an unsubscribe function.
     */
    addForegroundListener(callback: (notification: Notifications.Notification) => void) {
        const sub = Notifications.addNotificationReceivedListener(callback)
        return () => sub.remove()
    },

    /**
     * Listen for notification taps (user tapped the notification).
     */
    addResponseListener(callback: (response: Notifications.NotificationResponse) => void) {
        const sub = Notifications.addNotificationResponseReceivedListener(callback)
        return () => sub.remove()
    },

    /**
     * Clear all delivered notifications and badge count.
     */
    async clearBadge() {
        await Notifications.setBadgeCountAsync(0)
        await Notifications.dismissAllNotificationsAsync()
    },
}