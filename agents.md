# CashFlow — Agent & Developer Context

> Last updated: June 2026 — Production release
> Stack: React Native 0.74.5 · Expo ~51 · Supabase (PostgreSQL 17) · TypeScript

---

## Quick Reference

```
Package name  : com.cashflow.cashflow
EAS project   : 2dd5e903-ee74-4052-aa22-b8e1751a1ebf
Supabase ref  : qtnbxoblqnnracmlksda  (region: ap-southeast-2)
Author        : Aakash Sharma · aakashsharma9855@gmail.com
```

---

## Architecture

```
App.tsx                   boot: setup() + initialize() + loadTheme() + todos(userId)
navigation/index.tsx      AuthStack | AppStack + MainTabs (5 tabs)
src/
  screens/                14 screens
  services/               supabase, auth, books, entries, export, notifications, sync
  store/                  7 Zustand stores (auth, books, entries, inbox, offline, theme, todo)
  hooks/                  useEntriesRealtime, useOfflineSync, usePushNotifications
  components/common/      ThemedAlert (event-bus), OfflineBanner, AppLogo
  constants/index.ts      COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOW, PAGE_SIZE
  types/index.ts          Profile, Book, Entry, Invitation, BookMember
  utils/index.ts          formatAmount, getInitials, date helpers
```

---

## Critical Architecture Rules

### 1. Dark Mode — NEVER in StyleSheet.create()
All theme tokens must be applied as inline style props:
```tsx
// ✅ Correct
<Text style={[s.title, { color: theme.text }]}>

// ❌ Wrong — theme.text is undefined at StyleSheet.create() time
const s = StyleSheet.create({ title: { color: theme.text } })
```

### 2. Android New Architecture — Keep OFF
`newArchEnabled: false` for Android in `app.json`. expo-notifications and
@react-native-community/datetimepicker crash on Fabric (New Arch) with
NoSuchMethodException. iOS New Arch is enabled (works fine).

### 3. SectionList — No getItemLayout
`getItemLayout` on SectionList must account for section header heights in
the flat index offset calculation. The formula `ENTRY_ROW_HEIGHT * index` is
wrong — it ignores header rows. Result: items beyond ~15 don't render on scroll.
Fix: omit getItemLayout. Use windowSize={5} + removeClippedSubviews for perf.

### 4. Two-Cache System — Never Merge
entriesService.ts maintains two separate AsyncStorage keys:
- `displayCacheKey` — written ONLY by getEntries(page=0), holds 30 items for offline UI
- `fullCacheKey`   — written ONLY by getAllEntries(), holds ALL items for export
Merging them causes exports to return only 30 entries.

### 5. create_book() RPC — Never Direct INSERT
booksService.createBook() calls `supabase.rpc('create_book', {...})`.
Direct `.from('books').insert()` triggers the RLS WITH CHECK which evaluates
auth.uid() from the Supabase JS client — which reads the JWT from SecureStore
asynchronously. If the insert fires before the JWT read completes, auth.uid()
is null and the insert is rejected. The SECURITY DEFINER RPC reads auth.uid()
from the HTTP request header (always synchronous server-side).

### 6. RLS auth.uid() Pattern — Always use (select auth.uid())
Every RLS policy uses `(select auth.uid())` not `auth.uid()`. The subselect
form is evaluated ONCE per query; the bare form re-evaluates once per row.
At scale this is a 10-100x performance difference on large tables.

### 7. SIGNED_OUT ≠ Logout
Supabase fires SIGNED_OUT both on explicit logout AND on token refresh failure
(no internet). authStore handles this by checking getCachedProfile() before
clearing state. If a cached profile exists, the user is offline — stay logged in.
Explicit signOut() clears the cache FIRST so the event handler finds no cache.

### 8. Push Notifications — Three Layers
- **Task reminders**: OS-level AlarmManager alarms, always fire, no internet
- **Entry changes (app open)**: Supabase Realtime → useEntriesRealtime → local notification
- **Entry changes (app closed)**: pgmq trigger → pg_net HTTP → Expo Push API → FCM → device

Entry notifications use auth.uid() in the DB trigger (the actor, not creator).
Local Realtime notifications are suppressed for UPDATE/DELETE — server handles those.

---

## Database

### Tables
```
profiles      id, email, full_name, avatar_url, push_token, updated_at
books         id, name, currency, color, owner_id, created_at, updated_at
book_members  book_id, user_id, role (owner|member), created_at
entries       id, book_id, user_id, type, amount, note, entry_date, created_at, updated_at
invitations   id, book_id, inviter_id, invitee_email, invitee_id, status, created_at, updated_at
```

### Functions (all SECURITY DEFINER, owner: postgres)
| Function | Called by | Purpose |
|---|---|---|
| `create_book(name, desc, color, currency)` | App via RPC | Creates book + owner membership atomically |
| `handle_new_book()` | Trigger on books INSERT | Inserts owner into book_members |
| `handle_new_user()` | Trigger on auth.users INSERT | Creates profile, syncs Google avatar |
| `accept_invitation(uuid)` | App via RPC | Accepts invite, inserts book_members row |
| `reject_invitation(uuid)` | App via RPC | Updates invitation status to rejected |
| `is_book_member(uuid)` | RLS policies | Returns bool, NULL-safe |
| `is_book_owner(uuid)` | RLS policies | Returns bool, NULL-safe |
| `save_push_token(text)` | App via RPC | Saves push token, bypasses RLS timing |
| `notify_push_trigger()` | Trigger on entries/invitations | pgmq enqueue + immediate process |
| `process_push_message(jsonb)` | notify_push_trigger | Looks up members, calls send_expo_push |
| `send_expo_push(...)` | process_push_message | pg_net HTTP POST to Expo Push API |
| `format_inr(numeric)` | send_expo_push | Formats currency amounts |

### Migrations (run in order)
```
001_schema.sql                  — Base schema
002_fix_rls.sql                 — Initial RLS
003_fix_rls_final.sql           — RLS improvements
004_fix_rls_definitive.sql      — handle_new_book OWNER TO postgres fix
005_avatar_and_fcm.sql          — push_token column, avatar sync
006_pgmq_push_notifications.sql — pgmq + pg_net replaces Firebase Edge Function
007_fix_push_notifications.sql  — Drop old webhook triggers, fix process flow
008_fix_profiles_upsert.sql     — save_push_token SECURITY DEFINER function
009_fix_push_actor_id.sql       — Use auth.uid() in trigger (actual actor, not creator)
010_production_hardening.sql    — (select auth.uid()) in all policies, index cleanup
010b_remaining_indexes.sql      — Missing FK indexes
```

---

## Stores

| Store | Key State | Persistence |
|---|---|---|
| authStore | user, isAuthenticated, isLoading | AsyncStorage (profile cache) |
| booksStore | books[], currentBook | localBooksDb (AsyncStorage) |
| entriesStore | entries[], filter, summary, hasMore, isLoadingMore | Two-cache AsyncStorage |
| inboxStore | unreadCount | In-memory |
| offlineStore | isOnline, pendingQueue, isSyncing | AsyncStorage (queue) |
| themeStore | mode ('light'/'dark') | AsyncStorage |
| todoStore | todos[], filter, searchQuery | User-specific AsyncStorage key |

---

## Notification System

### Task Reminders (client-side, no server)
`notificationService.scheduleAllReminders(todoId, taskText, dueDate)` schedules:
1. `dueDate - 3min` → "⏰ Due Soon" + reminder.wav
2. `dueDate`       → "🔔 Task Due Now" + reminder.wav
3. `dueDate + 10min` → "📋 Task Still Pending" + reminder.wav

Trigger format: `{ seconds: N, repeats: false }` — this is expo-notifications ~0.28.x.
Do NOT use `{ type: 'timeInterval', seconds: N }` — rejected by 0.28.x with TypeError.

cancelTaskReminder(todoId) cancels by matching `notification.content.data.todoId`.

### Entry & Invitation Notifications (server-side)
```
DB change
  → notify_push_trigger() [AFTER trigger on entries/invitations]
    → pgmq.send('push_notifications', payload)  [audit trail]
    → process_push_message(payload)              [immediate call]
      → for each member (excluding actor via auth.uid()):
        → send_expo_push(token, title, body)
          → net.http_post('https://exp.host/--/api/v2/push/send')
```

Check pg_net responses: `SELECT id, status_code, content FROM net._http_response ORDER BY created DESC LIMIT 10;`

---

## Build Reference

```bash
# Dev
npx expo start

# Local debug APK
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Watch push logs
adb logcat -c && adb logcat | grep "\[Push\]\|\[Auth\]"

# EAS preview APK
eas build --platform android --profile preview

# EAS production AAB (Play Store)
eas build --platform android --profile production

# Check pgmq queue
# In Supabase SQL Editor:
SELECT * FROM pgmq.q_push_notifications LIMIT 10;
DELETE FROM pgmq.q_push_notifications;  -- clear if stuck
```

---

## Known Production Issues and Fixes

| Issue | Root Cause | Fix |
|---|---|---|
| Export returns only 30 entries | Shared cache key between display and full export | Two separate cache keys |
| Book creation RLS error | auth.uid() null during SecureStore async read | create_book() SECURITY DEFINER RPC |
| Logout when offline | SIGNED_OUT fires on token refresh failure | Check cache before clearing auth state |
| Own notification on delete | user_id is creator not actor | Use auth.uid() in DB trigger |
| SectionList blank after scroll | getItemLayout offsets ignore section headers | Remove getItemLayout entirely |
| Release build reminders broken | ProGuard strips expo-notifications alarm classes | -keep class expo.modules.notifications.** |
| Push token not saving | RLS silent fail (0 rows updated, no error) | save_push_token() SECURITY DEFINER RPC |
| Reminder TypeError | { type: 'timeInterval' } not valid in ~0.28.x | Use only { seconds, repeats } |