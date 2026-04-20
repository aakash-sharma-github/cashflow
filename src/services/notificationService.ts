// src/services/notificationService.ts
// Local-only notifications — no Firebase/FCM needed.
//
// CRITICAL: setNotificationHandler MUST be called at module load time,
// before any notification is scheduled. This configures how notifications
// appear when the app is in the foreground.

import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

// ── Handler — set at module import, not inside a function ─────
// If this is inside setup() or a try/catch, notifications may silently
// fail when the app is in the foreground.
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
})

// Android notification channels
const CH = {
    invitations: 'invitations',
    entries: 'entries',
    reminders: 'reminders',
}

let _permissionGranted: boolean | null = null  // cached after first check

export const notificationService = {

    /**
     * Request permission and create Android channels.
     * MUST be called before any notification is sent.
     * Caches the result so repeated calls are cheap.
     */
    async setup(): Promise<boolean> {
        // Not a physical device — simulator can't receive notifications
        if (!Device.isDevice) {
            _permissionGranted = false
            return false
        }

        // Create Android channels regardless of permission status
        if (Platform.OS === 'android') {
            try {
                await Notifications.setNotificationChannelAsync(CH.invitations, {
                    name: 'Invitations',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#5B5FED',
                    sound: 'invitation',   // maps to assets/sounds/invitation.wav
                    enableLights: true,
                    enableVibrate: true,
                })
                await Notifications.setNotificationChannelAsync(CH.entries, {
                    name: 'Entry Changes',
                    importance: Notifications.AndroidImportance.HIGH,
                    sound: 'default',
                    enableVibrate: true,
                })
                await Notifications.setNotificationChannelAsync(CH.reminders, {
                    name: 'Task Reminders',
                    importance: Notifications.AndroidImportance.HIGH,
                    vibrationPattern: [0, 300, 200, 300],
                    lightColor: '#F59E0B',
                    sound: 'reminder',     // maps to assets/sounds/reminder.wav
                    enableLights: true,
                    enableVibrate: true,
                })
            } catch (e) {
                console.warn('[Push] channel setup error:', e)
            }
        }

        // Request / check permission
        try {
            const { status: existing } = await Notifications.getPermissionsAsync()
            if (existing === 'granted') {
                _permissionGranted = true
                return true
            }
            const { status } = await Notifications.requestPermissionsAsync()
            _permissionGranted = status === 'granted'
            return _permissionGranted
        } catch (e) {
            console.warn('[Push] permission error:', e)
            _permissionGranted = false
            return false
        }
    },

    /** Check if we have permission — calls setup() if not yet checked */
    async hasPermission(): Promise<boolean> {
        if (_permissionGranted !== null) return _permissionGranted
        return notificationService.setup()
    },

    // ── Invitation ──────────────────────────────────────────────
    async sendInvitationNotification(inviterName: string, bookName: string): Promise<void> {
        if (!await notificationService.hasPermission()) return
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '📬 New Book Invitation',
                    body: `${inviterName} invited you to "${bookName}"`,
                    data: { type: 'invitation' },
                    // iOS: use custom sound file; Android: channel handles sound
                    sound: Platform.OS === 'ios' ? 'invitation.wav' : undefined,
                    ...(Platform.OS === 'android' && { channelId: CH.invitations }),
                },
                trigger: null,
            })
        } catch (e) {
            console.warn('[Push] sendInvitationNotification error:', e)
        }
    },

    // ── Entry change notifications ──────────────────────────────
    async sendEntryAddedNotification(
        bookName: string,
        amount: string,
        type: 'cash_in' | 'cash_out',
        note?: string
    ): Promise<void> {
        if (!await notificationService.hasPermission()) return
        try {
            const emoji = type === 'cash_in' ? '💰' : '💸'
            const verb = type === 'cash_in' ? 'received' : 'spent'
            const book = bookName ? `in "${bookName}"` : ''
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: `${emoji} New Entry${bookName ? ` — ${bookName}` : ''}`,
                    body: `${amount} ${verb}${note ? ` · ${note}` : ''}${book ? ` ${book}` : ''}`,
                    data: { type: 'entry_added' },
                    sound: 'default',
                    ...(Platform.OS === 'android' && { channelId: CH.entries }),
                },
                trigger: null,
            })
        } catch (e) {
            console.warn('[Push] sendEntryAddedNotification error:', e)
        }
    },

    async sendEntryEditedNotification(bookName: string, amount: string): Promise<void> {
        if (!await notificationService.hasPermission()) return
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '✏️ Entry Updated',
                    body: `An entry (${amount})${bookName ? ` in "${bookName}"` : ''} was edited`,
                    data: { type: 'entry_edited' },
                    sound: 'default',
                    ...(Platform.OS === 'android' && { channelId: CH.entries }),
                },
                trigger: null,
            })
        } catch (e) {
            console.warn('[Push] sendEntryEditedNotification error:', e)
        }
    },

    async sendEntryDeletedNotification(bookName: string): Promise<void> {
        if (!await notificationService.hasPermission()) return
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '🗑️ Entry Deleted',
                    body: `An entry${bookName ? ` in "${bookName}"` : ''} was removed by a collaborator`,
                    data: { type: 'entry_deleted' },
                    sound: 'default',
                    ...(Platform.OS === 'android' && { channelId: CH.entries }),
                },
                trigger: null,
            })
        } catch (e) {
            console.warn('[Push] sendEntryDeletedNotification error:', e)
        }
    },

    // ── Task reminders ──────────────────────────────────────────

    /**
     * Schedule the 5-minute warning before a task's reminder time.
     * Returns the notification identifier (store it to cancel later).
     */
    async scheduleTaskReminder(
        todoId: string,
        taskText: string,
        reminderDate: Date
    ): Promise<string | null> {
        if (!await notificationService.hasPermission()) return null
        try {
            // Cancel existing reminders for this task first
            await notificationService.cancelTaskReminder(todoId)

            const fiveMinBefore = new Date(reminderDate.getTime() - 5 * 60 * 1000)
            if (fiveMinBefore <= new Date()) return null  // already passed

            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: '⏰ Task Reminder',
                    body: `"${taskText}" is coming up in 5 minutes`,
                    data: { type: 'task_reminder', todoId },
                    sound: Platform.OS === 'ios' ? 'reminder.wav' : undefined,
                    ...(Platform.OS === 'android' && { channelId: CH.reminders }),
                },
                trigger: { date: fiveMinBefore },
            })
            return id
        } catch (e) {
            console.warn('[Push] scheduleTaskReminder error:', e)
            return null
        }
    },

    /**
     * Schedule a "still pending" notification at the exact reminder time.
     */
    async scheduleTaskPending(
        todoId: string,
        taskText: string,
        reminderDate: Date
    ): Promise<string | null> {
        if (!await notificationService.hasPermission()) return null
        try {
            if (reminderDate <= new Date()) return null

            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: '⚠️ Task Still Pending',
                    body: `Don't forget: "${taskText}"`,
                    data: { type: 'task_pending', todoId },
                    sound: Platform.OS === 'ios' ? 'reminder.wav' : undefined,
                    ...(Platform.OS === 'android' && { channelId: CH.reminders }),
                },
                trigger: { date: reminderDate },
            })
            return id
        } catch (e) {
            console.warn('[Push] scheduleTaskPending error:', e)
            return null
        }
    },

    /**
     * Cancel all scheduled notifications for a specific todo ID.
     */
    async cancelTaskReminder(todoId: string): Promise<void> {
        try {
            const scheduled = await Notifications.getAllScheduledNotificationsAsync()
            await Promise.all(
                scheduled
                    .filter(n => n.content.data?.todoId === todoId)
                    .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier))
            )
        } catch { }
    },

    // ── Listeners ───────────────────────────────────────────────
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