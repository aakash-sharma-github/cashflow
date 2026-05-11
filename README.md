# CashFlow — Offline-First Mobile Expense Tracker

> A production-grade collaborative cash book app built with React Native, Expo, and Supabase.

[![React Native](https://img.shields.io/badge/React_Native-0.74.3-61DAFB?logo=react)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-51-000020?logo=expo)](https://expo.dev)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**GitHub:** [github.com/aakash-sharma-github/cashflow](https://github.com/aakash-sharma-github/cashflow)

---

## Features

### Cash Book Management
- Create multiple cash books — personal, business, shop, or any category
- Track Cash In and Cash Out entries with notes and timestamps
- Running balance calculated automatically across all entries
- Filter entries by All / Cash In / Cash Out
- Date-grouped entry list with sticky section headers
- Multi-select entries for bulk delete

### Real-Time Collaboration
- Invite members to any book by email
- All members see entry changes live via Supabase Realtime WebSocket
- Role-based access: Owner manages members, all members add/edit entries
- Push notifications when collaborators add, edit, or delete entries

### Offline-First Architecture
- Full CRUD works with zero internet connection
- Operations queue in AsyncStorage and replay automatically on reconnect
- JWT session cached in SecureStore — stays authenticated offline
- Custom chunked SecureStore adapter handles tokens larger than the 2048-byte device limit
- Offline banner indicator shows connection status

### Export & Import
- **CSV export** — CashBook-compatible format: Date, Time, Remark, Entry by, Cash In, Cash Out, Balance
- **PDF export** — branded report with app logo, summary cards, running balance column
- **CSV import** — accepts CashBook format and simple Type/Amount format
- No page limit — full entry cache system exports all entries regardless of count

### Tasks & Reminders
- Offline-only todo list with priority levels (High / Medium / Low)
- Due date & time picker — sets reminder automatically
- 5-minute warning notification before due time
- Overdue alert if task is still incomplete at due time
- Reminders fire via OS alarm — works when app is fully closed, no server needed
- User-specific storage — each account keeps its own tasks across logout/login cycles

### Push Notifications
- Invitation notifications — fire when invited to a shared book
- Entry change notifications — collaborator adds/edits/deletes entries (not your own changes)
- App open/background: fires via Supabase Realtime + local notification
- App closed: fires via Firebase Cloud Messaging → Expo Push API → Supabase Edge Function
- Custom sounds for invitations and task reminders

### Auth & Profiles
- Google OAuth — one-tap sign in, profile picture synced automatically on every login
- Magic Link OTP — passwordless email sign in (dark-themed branded email template)
- Avatar shown in HomeScreen and Settings
- Profile name editing

### UI/UX
- Dark and light mode — system-aware, all theme tokens applied inline (zero StyleSheet.create violations)
- Bottom-sheet add/edit panels with spring slide-up animation
- Task preview modal with full details — due date, reminder, notes, completion status
- Three-dot menus on entries, tasks, and members for contextual actions

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.74.3 via Expo ~51 |
| Language | TypeScript |
| Backend | Supabase (PostgreSQL 17, Auth, Realtime, Edge Functions) |
| State | Zustand with AsyncStorage persistence |
| Navigation | React Navigation v6 (Stack + Bottom Tabs) |
| Offline | AsyncStorage queue + NetInfo + ChunkedSecureStore |
| Notifications | Expo Notifications + FCM (Firebase Cloud Messaging) |
| Export | expo-print (PDF), expo-file-system, expo-sharing |
| Build | EAS (Expo Application Services) |

---

## Project Structure

```
cashflow/
├── App.tsx                          # Boot: auth + theme + notifications + todos
├── app.json                         # Expo config — single version source of truth
├── eas.json                         # EAS build profiles (dev / preview / production)
├── babel.config.js
├── assets/
│   ├── icon.png
│   ├── splash.png
│   ├── adaptive-icon.png
│   ├── notification-icon.png
│   └── sounds/
│       ├── invitation.wav           # Custom chime for invitation notifications
│       └── reminder.wav             # Custom alert for task reminders
├── android/
│   └── app/
│       ├── google-services.json     # Firebase config — not committed, add your own
│       └── proguard-rules.pro
├── supabase/
│   ├── migrations/                  # 001 → 005, run in order
│   ├── functions/
│   │   ├── send-push-notification/  # FCM push via Expo Push API
│   │   └── send-invite/             # Email invitation sender
│   └── email-templates/
│       └── otp.html                 # Dark-themed branded OTP / magic link email
└── src/
    ├── screens/                     # 14 screens
    ├── services/
    │   ├── supabase.ts              # Client with ChunkedSecureStore
    │   ├── authService.ts           # OAuth, OTP, profile, avatar sync
    │   ├── booksService.ts          # CRUD via create_book() RPC (RLS-safe)
    │   ├── entriesService.ts        # Two-cache system: display + full export
    │   ├── invitationsService.ts
    │   ├── exportService.ts         # CSV + PDF generation
    │   ├── notificationService.ts   # Local + scheduled notifications
    │   └── syncService.ts           # Offline queue replay
    ├── store/                       # 7 Zustand stores
    ├── hooks/
    │   ├── useEntriesRealtime.ts    # Per-book Supabase Realtime subscription
    │   ├── useOfflineSync.ts        # Queue replay on reconnect
    │   └── usePushNotifications.ts  # Token registration + global entry subscription
    ├── components/common/
    │   ├── ThemedAlert.tsx          # Event-bus alert + action sheet
    │   ├── OfflineBanner.tsx
    │   └── AppLogo.tsx
    ├── navigation/index.tsx
    ├── constants/index.ts
    ├── types/index.ts
    └── utils/index.ts
```

---

## Database Schema

```
profiles        id, email, full_name, avatar_url, push_token, updated_at
books           id, name, currency, color, owner_id, created_at, updated_at
book_members    book_id, user_id, role (owner | member), created_at
entries         id, book_id, user_id, type, amount, note, entry_date, created_at, updated_at
invitations     id, book_id, inviter_id, invitee_email, invitee_id, status, created_at, updated_at
```

Row Level Security is enforced on all tables. All policies are scoped to the `authenticated` role.

**Key SECURITY DEFINER functions (owner: postgres — bypasses RLS safely):**

| Function | Purpose |
|---|---|
| `create_book()` | Atomically creates book + owner membership — avoids RLS timing race |
| `handle_new_book()` | Trigger: inserts owner into book_members |
| `handle_new_user()` | Trigger: creates profile + syncs Google avatar on signup |
| `accept_invitation()` | Accepts invite + inserts membership atomically |
| `is_book_member()` | RLS helper with NULL guard |
| `is_book_owner()` | RLS helper with NULL guard |

---

## Getting Started

### Prerequisites

- Node.js 18+
- `npm install -g expo-cli eas-cli`
- Supabase project
- Firebase project (for push when app is closed)

### 1. Clone and Install

```bash
git clone https://github.com/aakash-sharma-github/cashflow.git
cd cashflow
npm install
```

### 2. Environment Variables

```env
# .env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_EAS_PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 3. Supabase Setup

Run migrations in Supabase SQL Editor — in order, 001 through 005.

Enable **Google OAuth** and **Email OTP** in Authentication → Providers.

Paste `supabase/email-templates/otp.html` into Authentication → Email Templates.

### 4. EAS Project Linking

```bash
eas init
# Writes real projectId into app.json automatically
```

### 5. Firebase (FCM Push — for closed-app notifications)

1. Create project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add Android app using your `app.json` package name
3. Download `google-services.json` → place at `android/app/google-services.json`
4. Deploy Edge Function:
   ```bash
   supabase functions deploy send-push-notification
   ```
5. Create 4 Database Webhooks (Supabase Dashboard → Database → Webhooks) all pointing to `https://YOUR_REF.supabase.co/functions/v1/send-push-notification` with your service role key:

   | Table | Event |
   |---|---|
   | `entries` | INSERT |
   | `entries` | UPDATE |
   | `entries` | DELETE |
   | `invitations` | INSERT |

### 6. Start

```bash
npx expo start
```

---

## Build

```bash
# Local debug APK — fastest for device testing
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk

# EAS preview APK (internal testing)
eas build --platform android --profile preview

# EAS production AAB (Play Store submission)
eas build --platform android --profile production
```

---

## Architecture Notes

### Two-Cache System

`entriesService.ts` maintains two completely separate AsyncStorage caches:

- **Display cache** — written only by `getEntries(page=0)`, holds the latest 30 entries for fast offline display
- **Full export cache** — written only by `getAllEntries()`, holds all entries in batches of 500

Keeping them separate prevents the "export returns only 30 entries" bug — if they shared a key, `getAllEntries()` would find a fresh 30-entry cache and return truncated data.

### RLS + create_book() Pattern

The `books` INSERT policy can fail during session hydration — the Supabase client reads the JWT from SecureStore asynchronously, and if the request fires before that read completes, `auth.uid()` returns null server-side, failing the WITH CHECK. The `create_book()` SECURITY DEFINER function bypasses this: PostgREST always parses the JWT from the HTTP Authorization header synchronously, so `auth.uid()` is always correct.

### Notification Architecture

```
Task reminders
  OS alarm (AlarmManager) — fires even when device is asleep, no internet needed
  Trigger: { type: 'timeInterval', seconds: N, repeats: false }

Entry changes (app open/background)
  Supabase Realtime WebSocket → usePushNotifications global subscription
  Fires local notification — works without Firebase

Entry changes (app closed)
  DB trigger → Edge Function → Expo Push API → FCM → device
```

### Offline Queue

`useOfflineSync` listens to `NetInfo` for connectivity. Failed CRUD operations are serialised to an `offlineStore` Zustand queue (persisted in AsyncStorage). On reconnect, the queue replays in order and each item is removed on success.

---

## Security

- Row Level Security on all tables — enforced at database level, not application code
- All policies scoped to `authenticated` role — `anon` cannot read any data
- SECURITY DEFINER functions revoked from `anon` and `PUBLIC`
- JWT stored in hardware-backed SecureStore keychain
- No passwords stored — magic link OTP and Google OAuth only
- ProGuard enabled in release builds
- `google-services.json` excluded from version control (add to `.gitignore`)

---

## CSV Format

```
Date,Time,Remark,Entry by,Cash In,Cash Out,Balance
13/Apr/2026,09:47 pm,Salary,Aakash,108000,,108000
25/Apr/2026,09:01 pm,Groceries,Aakash,,1700,106300
```

Date: `dd/MMM/yyyy` · Time: `hh:mm am/pm` · Balance is recalculated on import.

---

## Author

Built by **Aakash Sharma** — Full-Stack Developer · Dubai, UAE

- 🌐 [aakashsharma.vercel.app](https://aakashsharma.vercel.app)
- 📧 aakashsharma9855@gmail.com
- 💼 [linkedin.com/in/aakash-sharma-918447178](https://linkedin.com/in/aakash-sharma-918447178)
- 🐙 [github.com/aakash-sharma-github](https://github.com/aakash-sharma-github)

---

## License

MIT — see [LICENSE](LICENSE) for details.