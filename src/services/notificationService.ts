// src/services/notificationService.ts
//
// ARCHITECTURE:
//  - setNotificationHandler must be at module level — registers BEFORE any notification fires
//  - setup() creates Android channels + requests permission — called at app boot AND on login
//  - Reminder scheduling uses { seconds } trigger — most compatible across Android versions
//  - Custom sounds (invitation.wav, reminder.wav) only work after a NATIVE REBUILD
//    with google-services.json present. Until then 'default' is used.
//  - All send methods check permission first and log clearly on failure

import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

// ── CRITICAL: must be at module level, not inside any function ─
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
})

// Android channel IDs
const CH = {
    invitations: 'cashflow_invitations',
    entries: 'cashflow_entries',
    reminders: 'cashflow_reminders',
}

let _setupDone = false
let _permGranted: boolean | null = null
let _setupPromise: Promise<boolean> | null = null  // prevent concurrent setup() calls

export const notificationService = {

    // ─────────────────────────────────────────────────────────────
    // setup()
    // Creates Android channels and requests permission.
    // Safe to call multiple times — deduped via _setupPromise.
    // ─────────────────────────────────────────────────────────────
    setup(): Promise<boolean> {
        // Return cached result if already granted
        if (_permGranted === true && _setupDone) return Promise.resolve(true)
        // Deduplicate concurrent calls
        if (_setupPromise) return _setupPromise

        _setupPromise = notificationService._doSetup().finally(() => {
            _setupPromise = null
        })
        return _setupPromise
    },

    async _doSetup(): Promise<boolean> {
        // On Android emulator Device.isDevice is false — skip entirely
        // On real Android devices this is always true
        if (Platform.OS === 'android' && !Device.isDevice) {
            console.log('[Push] Skipping setup — not a real device')
            _permGranted = false
            return false
        }

        // ── Step 1: Create Android notification channels ──────────
        // Use 'default' sound to avoid crashes when custom .wav not in res/raw.
        // After native rebuild with sounds in app.json, change to 'invitation'/'reminder'.
        if (Platform.OS === 'android') {
            try {
                await Notifications.setNotificationChannelAsync(CH.invitations, {
                    name: 'Invitations',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 100, 250],
                    lightColor: '#5B5FED',
                    enableLights: true,
                    enableVibrate: true,
                    // sound: 'invitation',  // uncomment after native rebuild with sounds
                })
                console.log('[Push] Channel created: invitations')

                await Notifications.setNotificationChannelAsync(CH.entries, {
                    name: 'Entry Changes',
                    importance: Notifications.AndroidImportance.HIGH,
                    enableVibrate: true,
                })
                console.log('[Push] Channel created: entries')

                await Notifications.setNotificationChannelAsync(CH.reminders, {
                    name: 'Task Reminders',
                    importance: Notifications.AndroidImportance.HIGH,
                    vibrationPattern: [0, 300, 150, 300],
                    lightColor: '#F59E0B',
                    enableLights: true,
                    enableVibrate: true,
                    // sound: 'reminder',  // uncomment after native rebuild with sounds
                })
                console.log('[Push] Channel created: reminders')
            } catch (e) {
                console.error('[Push] Channel creation failed:', e)
                // Don't return here — permission request can still succeed
            }
        }

        // ── Step 2: Request permission ────────────────────────────
        try {
            const { status: current } = await Notifications.getPermissionsAsync()
            console.log('[Push] Current permission status:', current)

            if (current === 'granted') {
                _permGranted = true
                _setupDone = true
                console.log('[Push] Permission already granted ✅')
                return true
            }

            const { status: requested } = await Notifications.requestPermissionsAsync()
            console.log('[Push] Requested permission, result:', requested)

            _permGranted = requested === 'granted'
            _setupDone = _permGranted
            return _permGranted
        } catch (e) {
            console.error('[Push] Permission request failed:', e)
            _permGranted = false
            return false
        }
    },

    async hasPermission(): Promise<boolean> {
        if (_permGranted === true) return true
        return notificationService.setup()
    },

    // ─────────────────────────────────────────────────────────────
    // DEBUG: test notification (fires in 3 seconds)
    // Call this from SettingsScreen to verify the whole pipeline.
    // ─────────────────────────────────────────────────────────────
    async debugTest(): Promise<void> {
        console.log('[Push] Running debug test...')

        const perm = await notificationService.setup()
        console.log('[Push] Permission granted:', perm)
        if (!perm) {
            console.error('[Push] ❌ No permission — go to Android Settings > Apps > CashFlow > Notifications > Enable')
            return
        }

        try {
            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: '✅ CashFlow Notifications Work!',
                    body: 'If you see this, notifications are working correctly.',
                    data: { type: 'debug' },
                    // No channelId — uses default channel, bypasses custom channel issues
                },
                trigger: { seconds: 3, repeats: false },
            })
            console.log('[Push] ✅ Test notification scheduled with id:', id)
            console.log('[Push] Minimize the app now — notification will appear in 3 seconds')
        } catch (e) {
            console.error('[Push] ❌ scheduleNotificationAsync FAILED:', e)
        }
    },

    // ─────────────────────────────────────────────────────────────
    // Invitation notification (fires immediately, trigger: null)
    // ─────────────────────────────────────────────────────────────
    async sendInvitationNotification(inviterName: string, bookName: string): Promise<void> {
        const ok = await notificationService.hasPermission()
        if (!ok) { console.warn('[Push] sendInvitation: no permission'); return }
        try {
            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: '📖 Book Invitation',
                    body: `${inviterName} invited you to join "${bookName}"`,
                    data: { type: 'invitation' },
                    ...(Platform.OS === 'android' && { channelId: CH.invitations }),
                },
                trigger: null,
            })
            console.log('[Push] Invitation notification sent, id:', id)
        } catch (e) {
            console.error('[Push] sendInvitationNotification error:', e)
        }
    },

    // ─────────────────────────────────────────────────────────────
    // Entry notifications (fire immediately, trigger: null)
    // Only called from useEntriesRealtime when user_id !== currentUserId
    // ─────────────────────────────────────────────────────────────
    async sendEntryAddedNotification(
        bookName: string,
        amount: string,
        type: 'cash_in' | 'cash_out',
        note?: string,
        addedBy?: string,
    ): Promise<void> {
        const ok = await notificationService.hasPermission()
        if (!ok) { console.warn('[Push] sendEntryAdded: no permission'); return }
        try {
            const arrow = type === 'cash_in' ? '↑' : '↓'
            const label = type === 'cash_in' ? 'Cash In' : 'Cash Out'
            const who = addedBy || 'A member'
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: `${arrow} ${amount} ${label}${bookName ? ` — ${bookName}` : ''}`,
                    body: note ? `"${note}" by ${who}` : `Added by ${who}`,
                    data: { type: 'entry_added' },
                    ...(Platform.OS === 'android' && { channelId: CH.entries }),
                },
                trigger: null,
            })
        } catch (e) {
            console.error('[Push] sendEntryAddedNotification error:', e)
        }
    },

    async sendEntryEditedNotification(bookName: string, amount: string, editedBy?: string): Promise<void> {
        const ok = await notificationService.hasPermission()
        if (!ok) return
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: `✏️ Entry Updated${bookName ? ` — ${bookName}` : ''}`,
                    body: `${editedBy || 'A member'} edited a ${amount} entry`,
                    data: { type: 'entry_edited' },
                    ...(Platform.OS === 'android' && { channelId: CH.entries }),
                },
                trigger: null,
            })
        } catch (e) {
            console.error('[Push] sendEntryEditedNotification error:', e)
        }
    },

    async sendEntryDeletedNotification(bookName: string, deletedBy?: string): Promise<void> {
        const ok = await notificationService.hasPermission()
        if (!ok) return
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: `🗑 Entry Removed${bookName ? ` — ${bookName}` : ''}`,
                    body: `${deletedBy || 'A member'} deleted an entry`,
                    data: { type: 'entry_deleted' },
                    ...(Platform.OS === 'android' && { channelId: CH.entries }),
                },
                trigger: null,
            })
        } catch (e) {
            console.error('[Push] sendEntryDeletedNotification error:', e)
        }
    },

    // ─────────────────────────────────────────────────────────────
    // Task reminders — pure OS-level scheduled alarms
    // Works without internet, Firebase, or any backend.
    // trigger: { seconds: N } is the most compatible format
    // across all Android versions and expo-notifications ~0.28
    // ─────────────────────────────────────────────────────────────
    async scheduleTaskReminder(todoId: string, taskText: string, dueDate: Date): Promise<string | null> {
        const ok = await notificationService.hasPermission()
        if (!ok) { console.warn('[Push] scheduleTaskReminder: no permission'); return null }

        try {
            // Cancel any existing reminder for this task first
            await notificationService.cancelTaskReminder(todoId)

            const now = Date.now()
            const fiveMinBefore = new Date(dueDate.getTime() - 5 * 60 * 1000)
            const secsUntilWarn = Math.floor((fiveMinBefore.getTime() - now) / 1000)
            const dueTimeStr = dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

            console.log('[Push] Scheduling 5-min warning:', secsUntilWarn, 'seconds from now')

            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: '⏰ Due Soon',
                    body: `"${taskText}" is due at ${dueTimeStr}`,
                    data: { type: 'task_reminder', todoId },
                    ...(Platform.OS === 'android' && { channelId: CH.reminders }),
                },
                // If < 5 min away: fire in 5 seconds (immediate-ish) so user still gets notified
                // If > 5 min away: fire exactly 5 min before
                // 'timeInterval' trigger type works across all Android versions
                // including Doze mode. Always fires even when device is in deep sleep.
                trigger: secsUntilWarn > 10
                    ? { type: 'timeInterval', seconds: secsUntilWarn, repeats: false } as any
                    : { type: 'timeInterval', seconds: 5, repeats: false } as any,
            })

            console.log('[Push] ✅ 5-min reminder scheduled, id:', id, 'fires in', Math.max(5, secsUntilWarn), 'seconds')
            return id
        } catch (e) {
            console.error('[Push] scheduleTaskReminder FAILED:', e)
            return null
        }
    },

    async scheduleTaskPending(todoId: string, taskText: string, dueDate: Date): Promise<string | null> {
        const ok = await notificationService.hasPermission()
        if (!ok) return null

        try {
            const secsUntilDue = Math.floor((dueDate.getTime() - Date.now()) / 1000)

            if (secsUntilDue <= 0) {
                console.log('[Push] scheduleTaskPending: due date is in the past, skipping')
                return null
            }

            console.log('[Push] Scheduling pending alert in', secsUntilDue, 'seconds')

            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: '📋 Task Still Pending',
                    body: `"${taskText}" is overdue`,
                    data: { type: 'task_pending', todoId },
                    ...(Platform.OS === 'android' && { channelId: CH.reminders }),
                },
                trigger: { type: 'timeInterval', seconds: secsUntilDue, repeats: false } as any,
            })

            console.log('[Push] ✅ Pending alert scheduled, id:', id)
            return id
        } catch (e) {
            console.error('[Push] scheduleTaskPending FAILED:', e)
            return null
        }
    },

    async cancelTaskReminder(todoId: string): Promise<void> {
        try {
            const scheduled = await Notifications.getAllScheduledNotificationsAsync()
            const toCancel = scheduled.filter(n => n.content.data?.todoId === todoId)
            if (toCancel.length > 0) {
                await Promise.all(toCancel.map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)))
                console.log('[Push] Cancelled', toCancel.length, 'reminder(s) for todo:', todoId)
            }
        } catch (e) {
            console.error('[Push] cancelTaskReminder error:', e)
        }
    },

    // ── Listeners ────────────────────────────────────────────────
    addForegroundListener(cb: (n: Notifications.Notification) => void) {
        try {
            const sub = Notifications.addNotificationReceivedListener(cb)
            return () => sub.remove()
        } catch { return () => { } }
    },

    addResponseListener(cb: (r: Notifications.NotificationResponse) => void) {
        try {
            const sub = Notifications.addNotificationResponseReceivedListener(cb)
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