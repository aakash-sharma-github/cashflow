# CashFlow — Offline-First Mobile Expense Tracker

> Collaborative cash book app · React Native · Expo · Supabase

[![React Native](https://img.shields.io/badge/React_Native-0.74.5-61DAFB?logo=react)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-51-000020?logo=expo)](https://expo.dev)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_17-3ECF8E?logo=supabase)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**GitHub:** [github.com/aakash-sharma-github/cashflow](https://github.com/aakash-sharma-github/cashflow)

---

## Features

**Cash Books** — Multiple ledger books per account. Cash In / Cash Out entries with notes, timestamps, and automatic running balance. Date-grouped list with sticky headers, multi-select bulk delete, and per-entry three-dot menu.

**Real-Time Collaboration** — Invite members by email; pending invitations identify the inviter. All members see entry changes live via Supabase Realtime. Members can create and manage their own entries; book owners can also manage member entries. Push notifications go to other relevant members, not the person who made the change.

**Offline-First** — Book and entry changes queue in AsyncStorage and replay on reconnect, including an owner's delete-all action. JWT session is cached in SecureStore, so a network loss does not sign the user out.

**Push Notifications** — Entry changes and invitations delivered via pgmq + pg_net + Expo Push API (no Firebase server SDK). Task reminders via OS-level alarms (fire even when app is closed). Three reminder alerts per task: 3-min warning, due-time, 10-min overdue.

**Export & Import** — CSV (CashBook-compatible) and PDF export with completeness checks. CSV import detects common formats and writes entries in bounded batches.

**Tasks** — Offline Zustand todo list with priority levels, due dates, reminder scheduling, notes, and preview modal. User-specific storage survives logout.

**Auth** — Google OAuth (profile picture synced) and email one-time codes. OTP request cooldowns and rate-limit errors help prevent repeated requests.

**Amounts** — Financial values use consistent thousands separators, preserve cents when present, omit trailing `.00`, and retain negative balances.

**UI** — Dark / light mode with zero `StyleSheet.create()` theme violations. Spring slide-up sheets. Bottom-sheet add/edit. Fully offline-capable navigation.

---

## Tech Stack

| Layer         | Technology                                             |
| ------------- | ------------------------------------------------------ |
| Framework     | React Native 0.74.5 via Expo ~51                       |
| Language      | TypeScript                                             |
| Backend       | Supabase (PostgreSQL 17, Auth, Realtime, pgmq, pg_net) |
| State         | Zustand + AsyncStorage                                 |
| Navigation    | React Navigation v6                                    |
| Notifications | expo-notifications + Expo Push API + FCM               |
| Build         | EAS (Expo Application Services)                        |

---

## Project Structure

```
cashflow/
├── App.tsx                         # Boot sequence
├── app.json                        # Expo config (single source of truth)
├── eas.json                        # Build profiles: dev / preview / production
├── babel.config.js
├── Metro.config.js                 # Metro configuration
├── google-services.json            # Firebase config — NOT committed (add your own)
├── assets/
│   ├── icon.png, splash.png, adaptive-icon.png
│   ├── notification-icon.png
│   └── sounds/
│       ├── invitation.wav          # Custom invitation sound
│       └── reminder.wav            # Custom reminder sound
├── android/app/
│   └── proguard-rules.pro          # Keeps expo-notifications alarm classes
├── supabase/
│   ├── migrations/                 # Baseline and additive database changes
│   ├── functions/
│   │   ├── cashflow-invite/        # Invitation email dispatch
│   │   └── send-push-notification/ # Legacy push function
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

### 3. Supabase

Database changes are tracked in `supabase/migrations/`. The repository contains an initial schema and later additive migrations; its filenames are not a reliable record of what has already been applied to a deployed project. For an existing project, compare the deployed migration history and schema before applying a migration. Do not run every SQL file blindly against production.

Enable Google OAuth and Email OTP in Authentication → Providers, and configure the matching app redirect URLs.

The collaboration permission and delete-all hardening requires applying `supabase/migrations/20261005120000_collaboration_permissions_delete_all.sql`. Apply it to the target Supabase environment before deploying the corresponding app version: it enforces author/owner entry mutation rules, provides pending invitees limited inviter-profile visibility, fixes notification actor attribution, and adds the owner-only delete-all RPC. Compare the deployed migration history first; this migration has not been applied automatically.

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

Production uses an Android App Bundle. Preview APKs target ARM Android devices by default; use `-PreactNativeArchitectures=x86_64` for an x86_64 emulator build.

---

## Versioning and releases

`app.json` is the semantic version source of truth. The release bump script synchronizes `package.json` and the Android runtime-version resource. If a generated iOS project is present locally, it synchronizes its version fields too; a clean checkout regenerates iOS settings from `app.json`. Android Gradle reads `versionName` directly from `app.json`.

The app displays the installed binary version and native build number through `expo-application`. In Expo Go it uses the app version from Expo config, since Expo Go's native version belongs to the host app. EAS manages production build numbers remotely; the app reads the number from the installed binary.

```bash
# Bump and synchronize all app/native versions
bun run release:patch   # e.g. 1.4.3 → 1.4.4
# or: bun run release:minor / bun run release:major

# Review synchronized version fields and update CHANGELOG.md
git diff -- app.json package.json android ios
```

For GitHub Releases, create a tag matching the released app version (currently `v1.4.4`), use the matching `CHANGELOG.md` section as the release notes, and attach the APK/AAB produced by the build. EAS increments production build numbers.

---

## Push Notification Architecture

```
Task reminders (no server):
  scheduleAllReminders() → OS AlarmManager → fires regardless of app state

Entry changes / invitations (server-side):
  DB write → notify_push_trigger() → pgmq queue → process_push_message()
           → pg_net HTTP POST → Expo Push API → FCM → device
```

Push fanout runs in PostgreSQL and uses the Expo Push API; invitation email dispatch is handled by the `cashflow-invite` Edge Function. No Firebase Admin SDK is required on the server.

---

## Security

- Row Level Security and API grants protect application data; their definitions are maintained in the Supabase migrations.
- Members can update or delete only entries they authored; book owners have broader entry management permissions enforced by RLS.
- Delete-all is available to book owners and uses an owner-checked database function, including when queued offline.
- Profile access is limited to fields used by the app and collaborators; push tokens are private.
- Public API roles do not have `TRUNCATE` access, and entry updates are limited to editable fields.
- JWT in hardware-backed SecureStore with chunked adapter (handles >2KB tokens)
- No passwords — Google OAuth + Magic Link OTP only
- ProGuard enabled in release builds

---

## Database Schema

```sql
profiles      (id, email, full_name, avatar_url, private push token, updated_at)
books         (id, name, currency, color, owner_id, created_at, updated_at)
book_members  (book_id, user_id, role, joined_at)
entries       (id, book_id, user_id, type, amount, note, entry_date, ...)
invitations   (id, book_id, inviter_id, invitee_email, invitee_id, status, ...)
invitation_email_dispatches  (internal invitation email delivery controls)
```

Ordinary app clients cannot read push tokens or access the internal invitation dispatch table.

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

[aakashsharma.com.cp](https://www.aakashsharma.com.np) · aakashsharma9855@gmail.com · [LinkedIn](https://linkedin.com/in/aakash-sharma-918447178) · [GitHub](https://github.com/aakash-sharma-github)

---

## License

MIT
