// src/services/notificationService.ts
// Local notifications only — no Firebase/FCM required.
// Handles: invitations, entry changes, task reminders, pending task alerts.

import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

// Notification channels (Android)
const CHANNELS = {
    invitations: 'invitations',
    entries: 'entries',
    reminders: 'reminders',
}

try {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
        }),
    })
} catch { }

export const notificationService = {

    async setup(): Promise<boolean> {
        try {
            if (!Device.isDevice) return false

            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync(CHANNELS.invitations, {
                    name: 'Invitations',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#5B5FED',
                    sound: 'default',
                })
                await Notifications.setNotificationChannelAsync(CHANNELS.entries, {
                    name: 'Entry Changes',
                    importance: Notifications.AndroidImportance.DEFAULT,
                    sound: 'default',
                })
                await Notifications.setNotificationChannelAsync(CHANNELS.reminders, {
                    name: 'Task Reminders',
                    importance: Notifications.AndroidImportance.HIGH,
                    vibrationPattern: [0, 300, 200, 300],
                    lightColor: '#F59E0B',
                    sound: 'default',
                })
            }

            const { status: existing } = await Notifications.getPermissionsAsync()
            if (existing === 'granted') return true
            const { status } = await Notifications.requestPermissionsAsync()
            return status === 'granted'
        } catch { return false }
    },

    // ── Invitation ──────────────────────────────────────────────
    async sendInvitationNotification(inviterName: string, bookName: string): Promise<void> {
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '📬 New Book Invitation',
                    body: `${inviterName} invited you to "${bookName}"`,
                    data: { type: 'invitation' },
                    sound: 'default',
                    ...(Platform.OS === 'android' && { channelId: CHANNELS.invitations }),
                },
                trigger: null,
            })
        } catch { }
    },

    // ── Entry change notifications ──────────────────────────────
    async sendEntryAddedNotification(bookName: string, amount: string, type: 'cash_in' | 'cash_out', note?: string): Promise<void> {
        try {
            const emoji = type === 'cash_in' ? '💰' : '💸'
            const dir = type === 'cash_in' ? 'added' : 'spent'
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: `${emoji} Entry in ${bookName}`,
                    body: note ? `${amount} ${dir} — ${note}` : `${amount} ${dir}`,
                    data: { type: 'entry_added' },
                    sound: 'default',
                    ...(Platform.OS === 'android' && { channelId: CHANNELS.entries }),
                },
                trigger: null,
            })
        } catch { }
    },

    async sendEntryEditedNotification(bookName: string, amount: string): Promise<void> {
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '✏️ Entry Updated',
                    body: `An entry (${amount}) in "${bookName}" was edited`,
                    data: { type: 'entry_edited' },
                    sound: 'default',
                    ...(Platform.OS === 'android' && { channelId: CHANNELS.entries }),
                },
                trigger: null,
            })
        } catch { }
    },

    async sendEntryDeletedNotification(bookName: string): Promise<void> {
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '🗑️ Entry Deleted',
                    body: `An entry in "${bookName}" was removed by a collaborator`,
                    data: { type: 'entry_deleted' },
                    sound: 'default',
                    ...(Platform.OS === 'android' && { channelId: CHANNELS.entries }),
                },
                trigger: null,
            })
        } catch { }
    },

    // ── Task reminders ──────────────────────────────────────────

    /**
     * Schedule a reminder 5 minutes before the task's reminder time.
     * Returns the notification identifier so it can be cancelled later.
     */
    async scheduleTaskReminder(todoId: string, taskText: string, reminderDate: Date): Promise<string | null> {
        try {
            // Cancel any existing reminder for this task first
            await notificationService.cancelTaskReminder(todoId)

            const fiveMinBefore = new Date(reminderDate.getTime() - 5 * 60 * 1000)
            const now = new Date()

            // Only schedule if the reminder is in the future
            if (fiveMinBefore <= now) return null

            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: '⏰ Task Reminder',
                    body: `"${taskText}" is due in 5 minutes`,
                    data: { type: 'task_reminder', todoId },
                    sound: 'default',
                    ...(Platform.OS === 'android' && { channelId: CHANNELS.reminders }),
                },
                trigger: { date: fiveMinBefore },
            })

            return id
        } catch { return null }
    },

    /**
     * Schedule a "still pending" notification at the exact reminder time
     * if the task hasn't been completed.
     * Returns the identifier.
     */
    async scheduleTaskPending(todoId: string, taskText: string, reminderDate: Date): Promise<string | null> {
        try {
            const now = new Date()
            if (reminderDate <= now) return null

            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: '⚠️ Task Still Pending',
                    body: `"${taskText}" hasn't been completed yet`,
                    data: { type: 'task_pending', todoId },
                    sound: 'default',
                    ...(Platform.OS === 'android' && { channelId: CHANNELS.reminders }),
                },
                trigger: { date: reminderDate },
            })

            return id
        } catch { return null }
    },

    /**
     * Cancel all scheduled notifications for a specific todo.
     * Call this when a task is completed, deleted, or its reminder is removed.
     */
    async cancelTaskReminder(todoId: string): Promise<void> {
        try {
            const scheduled = await Notifications.getAllScheduledNotificationsAsync()
            const toCancel = scheduled.filter(
                n => n.content.data?.todoId === todoId
            )
            for (const n of toCancel) {
                await Notifications.cancelScheduledNotificationAsync(n.identifier)
            }
        } catch { }
    },

    // ── Listeners ───────────────────────────────────────────────
    addForegroundListener(callback: (n: Notifications.Notification) => void) {
        try {
            const sub = Notifications.addNotificationReceivedListener(callback)
            return () => sub.remove()
        } catch { return () => { } }
    },

    addResponseListener(callback: (r: Notifications.NotificationResponse) => void) {
        try {
            const sub = Notifications.addNotificationResponseReceivedListener(callback)
            return () => sub.remove()
        } catch { return () => { } }
    },

    async clearBadge(): Promise<void> {
        try {
            await Notifications.setBadgeCountAsync(0)
            await Notifications.dismissAllNotificationsAsync()
        } catch { }
    },
}