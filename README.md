# 💰 CashFlow

> Smart, collaborative expense tracking for individuals and teams.

A production-grade mobile app built with **React Native (Expo ~51)** + **Supabase**. Track cash flow across multiple ledger books, collaborate in real time, and stay on top of every transaction — online or offline.

---

## ✨ Features

### Core
- 📧 **Magic Link + Google OAuth** — passwordless sign-in
- 📚 **Multiple Books** — Personal, Business, Family — independent ledgers
- 💸 **Cash In / Cash Out** — entries with notes, custom date/time picker
- 📊 **Running Balance** — always-visible net position
- 🎨 **Dark & Light Mode** — system-aware, persisted preference

### Collaboration
- 👥 **Invite by Email** — add collaborators to any book
- 🔔 **Local Push Notifications** — instant alert when you receive an invite
- ⚡ **Real-Time Sync** — all members see changes live via Supabase Realtime
- 🔐 **Row Level Security** — users only access their own data

### Offline First
- 📴 **Full Offline CRUD** — create, edit, delete without internet
- 🔄 **Auto Sync** — queued operations replay on reconnect
- 💾 **Local Cache** — all data readable offline via AsyncStorage

### Export & Import
- 📊 **CSV Export** — open in Excel, Google Sheets, Numbers
- 📑 **PDF Export** — branded report with summary + transaction table
- 📗 **Excel Export (.xlsx)** — native Excel workbook with summary sheet
- 📂 **CSV / Excel / XLSM Import** — bulk import with live preview

### Tasks
- ✅ **Offline Todos** — full task manager, device-local, no server needed
- 🎯 **Priority Levels** — High / Medium / Low with color coding
- 🔍 **Search + Filter** — find and filter tasks instantly

### Settings & Profile
- 👤 **Edit Display Name** — update what collaborators see
- 🔒 **Privacy Policy** — full in-app page
- 📜 **Terms & Conditions** — full in-app page

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native 0.74 (Expo ~51) |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| State | Zustand 4 |
| Navigation | React Navigation v6 |
| Auth | Magic Link OTP + Google OAuth |
| Storage | Expo SecureStore (chunked) + AsyncStorage |
| Notifications | expo-notifications (local, no Firebase) |
| Export | expo-print + expo-sharing + xlsx |
| Version | expo-constants (reads from app.json) |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- `npm install -g eas-cli`
- Supabase account (free tier works)
- Physical device with Expo Go (for testing)

### 1. Clone & Install
```bash
git clone https://github.com/aakash-sharma-github/cashflow.git
cd cashflow
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Fill in:
# EXPO_PUBLIC_SUPABASE_URL
# EXPO_PUBLIC_SUPABASE_ANON_KEY
# EXPO_PUBLIC_EAS_PROJECT_ID
```

### 3. Run Supabase Migrations
In Supabase SQL Editor, run in order:
1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_fix_rls.sql`
3. `supabase/migrations/003_fix_rls_final.sql`
4. `supabase/migrations/004_fix_rls_definitive.sql` ← **Required**

### 4. Configure Supabase Auth
- Auth → URL Config → add `cashflow://auth/callback`
- Auth → Providers → enable Google (Client ID + Secret)

### 5. Start Dev Server
```bash
npx expo start
# Scan QR with Expo Go app
```

---

## 📁 Project Structure

```
cashflow/
├── App.tsx                          # Boot: auth + theme + offline + push
├── app.json                         # Single version source of truth
├── eas.json                         # EAS build profiles (autoIncrement)
├── scripts/
│   └── bump-version.js              # npm run version:patch|minor|major
├── assets/                          # icon, splash, adaptive-icon, notification-icon
├── src/
│   ├── screens/ (13 screens)
│   ├── services/ (9 services)
│   ├── store/ (7 Zustand stores)
│   ├── hooks/ (3 hooks)
│   ├── components/common/
│   │   ├── OfflineBanner.tsx
│   │   └── ThemedAlert.tsx          # Themed dialogs + action sheets
│   ├── navigation/index.tsx
│   ├── utils/
│   │   ├── index.ts
│   │   └── version.ts               # Live version from expo-constants
│   ├── constants/index.ts
│   └── types/index.ts
└── supabase/
    ├── migrations/ (4 SQL files)
    └── functions/send-invite/
```

---

## 🔢 Versioning

Version is managed in `app.json` only — never hardcode it anywhere else.

```bash
npm run version:patch   # 1.0.0 → 1.0.1  (bug fixes)
npm run version:minor   # 1.0.0 → 1.1.0  (new features)
npm run version:major   # 1.0.0 → 2.0.0  (breaking changes)
```

`versionCode` (Android) is **auto-incremented by EAS** on each production build — you never touch it. The in-app version display reads from `expo-constants` at runtime.

---

## 🔐 Security

- Row Level Security on all tables (see migration 004 for the definitive fix)
- JWT tokens chunked across SecureStore keys (>2KB limit bypass)
- All trigger/helper functions owned by `postgres` (true superuser bypass)
- Local notifications only — no Firebase/FCM required

---

## 📦 All Dependencies

See `package.json`. Key additions beyond standard Expo:
`@react-native-community/datetimepicker`, `expo-notifications`, `expo-device`, `expo-constants`, `expo-splash-screen`, `xlsx`

---

## 🗺️ Roadmap

See `agents.md` for detailed future scope checkpoints (FP-01 through FP-12).

---

## 📝 License

MIT © 2026 CashFlow