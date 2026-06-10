# CashFlow — Offline-First Mobile Expense Tracker

> Production-grade collaborative cash book app · React Native · Expo · Supabase

[![React Native](https://img.shields.io/badge/React_Native-0.74.5-61DAFB?logo=react)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-51-000020?logo=expo)](https://expo.dev)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_17-3ECF8E?logo=supabase)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**GitHub:** [github.com/aakash-sharma-github/cashflow](https://github.com/aakash-sharma-github/cashflow)

---

## Features

**Cash Books** — Multiple ledger books per account. Cash In / Cash Out entries with notes, timestamps, and automatic running balance. Date-grouped list with sticky headers, multi-select bulk delete, and per-entry three-dot menu.

**Real-Time Collaboration** — Invite members by email. All members see entry changes live via Supabase Realtime. Role-based access: owners manage members, all members create entries.

**Offline-First** — Full CRUD without internet. Operations queue in AsyncStorage and replay on reconnect. JWT session cached in SecureStore — stays authenticated offline. No logout on network loss.

**Push Notifications** — Entry changes and invitations delivered via pgmq + pg_net + Expo Push API (no Firebase server SDK). Task reminders via OS-level alarms (fire even when app is closed). Three reminder alerts per task: 3-min warning, due-time, 10-min overdue.

**Export & Import** — CSV (CashBook-compatible) and PDF export with unlimited entries. CSV import with auto-format detection.

**Tasks** — Offline Zustand todo list with priority levels, due dates, reminder scheduling, notes, and preview modal. User-specific storage survives logout.

**Auth** — Google OAuth (profile picture synced) and Magic Link OTP. Custom dark-themed email template.

**UI** — Dark / light mode with zero `StyleSheet.create()` theme violations. Spring slide-up sheets. Bottom-sheet add/edit. Fully offline-capable navigation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.74.5 via Expo ~51 |
| Language | TypeScript |
| Backend | Supabase (PostgreSQL 17, Auth, Realtime, pgmq, pg_net) |
| State | Zustand + AsyncStorage |
| Navigation | React Navigation v6 |
| Notifications | expo-notifications + Expo Push API + FCM |
| Build | EAS (Expo Application Services) |

---

## Project Structure

```
cashflow/
├── App.tsx                         # Boot sequence
├── app.json                        # Expo config (single source of truth)
├── eas.json                        # Build profiles: dev / preview / production
├── babel.config.js
├── metro.config.js                 # inlineRequires: true for fast startup
├── google-services.json            # Firebase config — NOT committed (add your own)
├── assets/
│   ├── icon.png, splash.png, adaptive-icon.png
│   ├── notification-icon.png
│   └── sounds/
│       ├── notification.wav        # Custom invitation sound
│       └── reminder.wav            # Custom reminder sound
├── android/app/
│   └── proguard-rules.pro          # Keeps expo-notifications alarm classes
├── supabase/
│   ├── migrations/                 # 001 → 010b, run in order
│   ├── functions/
│   │   └── send-push-notification/ # Legacy Edge Function (replaced by pgmq)
│   └── email-templates/
│       └── otp.html                # Dark-themed branded OTP email
└── src/
    ├── screens/                    # 14 screens
    ├── services/                   # supabase, auth, books, entries, export, notifications
    ├── store/                      # 7 Zustand stores
    ├── hooks/                      # useEntriesRealtime, useOfflineSync, usePushNotifications
    ├── components/common/          # ThemedAlert, OfflineBanner, AppLogo
    ├── navigation/index.tsx
    ├── constants/index.ts
    ├── types/index.ts
    └── utils/index.ts
```

---

## Getting Started

### Prerequisites
- Node.js 18+ · Java 17 · Android SDK
- `npm install -g expo-cli eas-cli`
- Supabase project · Firebase project

### 1. Clone and install
```bash
git clone https://github.com/aakash-sharma-github/cashflow.git
cd cashflow
npm install
```

### 2. Environment variables
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_EAS_PROJECT_ID=your-eas-project-id
```

### 3. Supabase — run migrations in order
In Supabase SQL Editor, run `supabase/migrations/001_schema.sql` through `010b_remaining_indexes.sql`.

Enable Google OAuth and Email OTP in Authentication → Providers.

### 4. Firebase
1. Create project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add Android app (package: `com.cashflow.cashflow`)
3. Download `google-services.json` → place at project root
4. Upload FCM Server Key to Expo: `eas credentials` → Android → FCM API Key

### 5. EAS setup
```bash
eas init    # Sets projectId in app.json
```

### 6. Run
```bash
npx expo start
```

---

## Build

```bash
# Local debug APK (fastest for testing)
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk

# EAS preview APK (internal testing)
eas build --platform android --profile preview

# EAS production AAB (Play Store)
eas build --platform android --profile production
```

---

## Push Notification Architecture

```
Task reminders (no server):
  scheduleAllReminders() → OS AlarmManager → fires regardless of app state

Entry changes / invitations (server-side):
  DB write → notify_push_trigger() → pgmq queue → process_push_message()
           → pg_net HTTP POST → Expo Push API → FCM → device
```

No Firebase Admin SDK. No Edge Function. Everything runs inside PostgreSQL.

---

## Security

- Row Level Security on all 5 tables, all policies use `(select auth.uid())`
- All policies scoped to `authenticated` role — anon cannot access any data  
- SECURITY DEFINER functions revoked from `anon` and `PUBLIC`
- JWT in hardware-backed SecureStore with chunked adapter (handles >2KB tokens)
- No passwords — Google OAuth + Magic Link OTP only
- ProGuard enabled in release builds

---

## Database Schema

```sql
profiles      (id, email, full_name, avatar_url, push_token, updated_at)
books         (id, name, currency, color, owner_id, created_at, updated_at)
book_members  (book_id, user_id, role, created_at)
entries       (id, book_id, user_id, type, amount, note, entry_date, ...)
invitations   (id, book_id, inviter_id, invitee_email, invitee_id, status, ...)
```

---

## CSV Format

```
Date,Time,Remark,Entry by,Cash In,Cash Out,Balance
13/Apr/2026,09:47 pm,Salary,Aakash,108000,,108000
25/Apr/2026,09:01 pm,Groceries,Aakash,,1700,106300
```

---

## Author

**Aakash Sharma** · Full-Stack Developer · Dubai, UAE

[aakashsharma.vercel.app](https://aakashsharma.vercel.app) · aakashsharma9855@gmail.com · [LinkedIn](https://linkedin.com/in/aakash-sharma-918447178) · [GitHub](https://github.com/aakash-sharma-github)

---

## License

MIT