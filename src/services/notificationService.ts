// src/services/notificationService.ts
// Local notifications — no Firebase/FCM required.
// IMPORTANT: setNotificationHandler MUST be at module level (not inside setup())
// so it's registered before any notification fires.

import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

// ── Handler registered at module import time ──────────────────
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
})

const CH = {
    invitations: 'cashflow_invitations',
    entries: 'cashflow_entries',
    reminders: 'cashflow_reminders',
}

// NOTE: _permissionGranted is intentionally NOT pre-set to null so that
// setup() is always called fresh on each app start (module memory resets on restart).
let _permissionGranted: boolean | null = null

export const notificationService = {

    /**
     * Request permission + create Android channels.
     * Called at app boot (App.tsx) and again on login.
     * Safe to call multiple times — channels are idempotent.
     */
    async setup(): Promise<boolean> {
        if (!Device.isDevice) {
            // Simulator — can't receive notifications but still set up channels
            // so that debug logs are meaningful
            _permissionGranted = false
            return false
        }

        if (Platform.OS === 'android') {
            try {
                await Notifications.setNotificationChannelAsync(CH.invitations, {
                    name: 'Invitations',
                    description: 'New book invitation alerts',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 200, 100, 200],
                    lightColor: '#5B5FED',
                    sound: 'invitation',
                    enableLights: true,
                    enableVibrate: true,
                    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
                    bypassDnd: false,
                })
                await Notifications.setNotificationChannelAsync(CH.entries, {
                    name: 'Entry Changes',
                    description: 'Alerts when collaborators add or change entries',
                    importance: Notifications.AndroidImportance.HIGH,
                    sound: 'default',
                    enableVibrate: true,
                })
                await Notifications.setNotificationChannelAsync(CH.reminders, {
                    name: 'Task Reminders',
                    description: 'Scheduled task due-date reminders',
                    importance: Notifications.AndroidImportance.HIGH,
                    vibrationPattern: [0, 300, 150, 300],
                    lightColor: '#F59E0B',
                    sound: 'reminder',
                    enableLights: true,
                    enableVibrate: true,
                })
            } catch (e) {
                console.warn('[Push] channel setup error:', e)
            }
        }

        try {
            const { status: existing } = await Notifications.getPermissionsAsync()
            if (existing === 'granted') { _permissionGranted = true; return true }
            const { status } = await Notifications.requestPermissionsAsync({
                ios: {
                    allowAlert: true,
                    allowBadge: true,
                    allowSound: true,
                    allowDisplayInCarPlay: false,
                    allowCriticalAlerts: false,
                },
            })
            _permissionGranted = status === 'granted'
            return _permissionGranted
        } catch (e) {
            console.warn('[Push] permission error:', e)
            _permissionGranted = false
            return false
        }
    },

    async hasPermission(): Promise<boolean> {
        if (_permissionGranted === true) return true
        return notificationService.setup()
    },

    // ── Invitation ──────────────────────────────────────────────
    // Modern design: clear title + rich body with context
    async sendInvitationNotification(inviterName: string, bookName: string): Promise<void> {
        if (!await notificationService.hasPermission()) return
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '📖 Book Invitation',
                    subtitle: Platform.OS === 'ios' ? `From ${inviterName}` : undefined,
                    body: `${inviterName} has invited you to join "${bookName}". Tap to accept or decline.`,
                    data: { type: 'invitation', bookName },
                    sound: Platform.OS === 'ios' ? 'invitation.wav' : undefined,
                    badge: 1,
                    ...(Platform.OS === 'android' && { channelId: CH.invitations }),
                },
                trigger: null,
            })
        } catch (e) {
            console.warn('[Push] sendInvitationNotification error:', e)
        }
    },

    // ── Entry notifications ─────────────────────────────────────
    // Only fires when a COLLABORATOR (not the current user) makes a change.
    // See useEntriesRealtime.ts for the user_id guard.
    async sendEntryAddedNotification(
        bookName: string,
        amount: string,
        type: 'cash_in' | 'cash_out',
        note?: string,
        addedBy?: string,
    ): Promise<void> {
        if (!await notificationService.hasPermission()) return
        try {
            const isCashIn = type === 'cash_in'
            const arrow = isCashIn ? '↑' : '↓'
            const label = isCashIn ? 'Cash In' : 'Cash Out'
            const who = addedBy ? addedBy : 'A member'
            const inBook = bookName ? ` in ${bookName}` : ''
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: `${arrow} ${amount} ${label}${inBook}`,
                    subtitle: Platform.OS === 'ios' ? `Added by ${who}` : undefined,
                    body: note
                        ? `"${note}" — added by ${who}`
                        : `${who} recorded a new ${label.toLowerCase()} entry`,
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

    async sendEntryEditedNotification(
        bookName: string,
        amount: string,
        editedBy?: string,
    ): Promise<void> {
        if (!await notificationService.hasPermission()) return
        try {
            const who = editedBy ? editedBy : 'A member'
            const inBook = bookName ? ` in ${bookName}` : ''
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: `✏️ Entry Updated${inBook}`,
                    subtitle: Platform.OS === 'ios' ? `${who} · ${amount}` : undefined,
                    body: `${who} edited a ${amount} entry${inBook}`,
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

    async sendEntryDeletedNotification(
        bookName: string,
        deletedBy?: string,
    ): Promise<void> {
        if (!await notificationService.hasPermission()) return
        try {
            const who = deletedBy ? deletedBy : 'A member'
            const inBook = bookName ? ` in ${bookName}` : ''
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: `🗑 Entry Removed${inBook}`,
                    subtitle: Platform.OS === 'ios' ? who : undefined,
                    body: `${who} deleted an entry${inBook}`,
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
    async scheduleTaskReminder(
        todoId: string,
        taskText: string,
        dueDate: Date,
    ): Promise<string | null> {
        if (!await notificationService.hasPermission()) return null
        try {
            await notificationService.cancelTaskReminder(todoId)

            const fiveMinBefore = new Date(dueDate.getTime() - 5 * 60 * 1000)
            const secsUntilWarn = Math.floor((fiveMinBefore.getTime() - Date.now()) / 1000)

            // Fire the warning notification (5 min before, or immediately if < 5 min away)
            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: '⏰ Due Soon',
                    subtitle: Platform.OS === 'ios' ? '5 minutes remaining' : undefined,
                    body: `"${taskText}" is due at ${fiveMinBefore.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                    data: { type: 'task_reminder', todoId },
                    sound: Platform.OS === 'ios' ? 'reminder.wav' : undefined,
                    ...(Platform.OS === 'android' && { channelId: CH.reminders }),
                },
                trigger: secsUntilWarn > 0
                    ? { seconds: secsUntilWarn, repeats: false }
                    : null,  // fire immediately if < 5 min
            })
            return id
        } catch (e) {
            console.warn('[Push] scheduleTaskReminder error:', e)
            return null
        }
    },

    async scheduleTaskPending(
        todoId: string,
        taskText: string,
        dueDate: Date,
    ): Promise<string | null> {
        if (!await notificationService.hasPermission()) return null
        try {
            const secsUntilDue = Math.floor((dueDate.getTime() - Date.now()) / 1000)
            if (secsUntilDue <= 0) return null

            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: '📋 Task Still Pending',
                    subtitle: Platform.OS === 'ios' ? 'Due now' : undefined,
                    body: `Don't forget: "${taskText}" was due and hasn't been completed yet`,
                    data: { type: 'task_pending', todoId },
                    sound: Platform.OS === 'ios' ? 'reminder.wav' : undefined,
                    ...(Platform.OS === 'android' && { channelId: CH.reminders }),
                },
                trigger: { seconds: secsUntilDue, repeats: false },
            })
            return id
        } catch (e) {
            console.warn('[Push] scheduleTaskPending error:', e)
            return null
        }
    },

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