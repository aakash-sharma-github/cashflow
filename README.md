# 💰 CashFlow

> Smart, collaborative expense tracking for individuals and teams.

A production-grade mobile app built with **React Native (Expo)** + **Supabase**. Track cash flow across multiple ledger books, collaborate with teammates in real time, and stay on top of every rupee — online or offline.

---

## ✨ Features

### Core
- 📧 **Magic Link + Google OAuth** — Sign in without a password
- 📚 **Multiple Books** — Personal, Business, Family — keep everything separate
- 💸 **Cash In / Cash Out** — Track every transaction with notes and a custom date/time picker
- 📊 **Running Balance** — Always see your net position at a glance
- 🎨 **Dark & Light Mode** — Persisted preference, applied app-wide

### Collaboration
- 👥 **Invite by Email** — Add collaborators to any book
- 🔔 **Push Notifications** — Get notified the moment someone invites you
- ⚡ **Real-Time Sync** — All members see changes instantly via Supabase Realtime
- 🔐 **Row Level Security** — Only members can access their books

### Offline First
- 📴 **Offline CRUD** — Create, edit, delete entries and books without internet
- 🔄 **Auto Sync** — Queued changes upload automatically when connectivity returns
- 💾 **Local Cache** — All data cached to AsyncStorage, readable offline

### Export & Import
- 📊 **CSV Export** — Open in Excel, Google Sheets, Numbers
- 📑 **PDF Export** — Branded report with summary + full transaction table
- 📂 **CSV Import** — Bulk import entries from any CSV file with preview

### Settings
- 👤 **Edit Profile** — Update your display name
- 🔒 **Privacy Policy** — Full in-app privacy policy page
- 📜 **Terms & Conditions** — Full in-app terms page
- 👥 **Members View** — See all people you've invited across your books

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native 0.74 (Expo ~51) |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| State | Zustand 4 |
| Navigation | React Navigation v6 |
| Auth | Supabase Magic Link + Google OAuth |
| Storage | Expo SecureStore (chunked) + AsyncStorage |
| Push | Expo Notifications |
| Export | expo-print + expo-sharing + expo-file-system |
| Icons | @expo/vector-icons (Ionicons) |
| Gradients | expo-linear-gradient |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Physical device with Expo Go app (for push notifications)
- Supabase account (free tier)

### 1. Clone & Install
```bash
git clone https://github.com/aakash-sharma-github/cashflow.git
cd cashflow
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```
Edit `.env`:
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
EXPO_PUBLIC_EAS_PROJECT_ID=your-eas-project-id
```

### 3. Run Database Migrations
In Supabase SQL Editor, run **in order**:
1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_fix_rls.sql`
3. `supabase/migrations/003_fix_rls_final.sql` ← **Required**

### 4. Configure Supabase
- **Auth → URL Configuration** → Add redirect: `cashflow://auth/callback`
- **Auth → Providers** → Enable Google (add Client ID + Secret)
- **Database → Replication** → Enable for: `entries`, `book_members`, `invitations`

### 5. Run the App
```bash
npx expo start
```
Scan the QR code with Expo Go on your device.

---

## 📁 Project Structure

```
cashflow/
├── App.tsx                         # Entry point
├── assets/                         # Icons, splash, adaptive icon
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx         # Magic link + Google OAuth
│   │   ├── VerifyOtpScreen.tsx     # OTP entry
│   │   ├── HomeScreen.tsx          # Books list + balance
│   │   ├── BookDetailScreen.tsx    # Entries + filter + balance
│   │   ├── AddEditEntryScreen.tsx  # Entry form + datetime picker
│   │   ├── CreateBookScreen.tsx    # Book create/edit
│   │   ├── MembersScreen.tsx       # Invite + member management
│   │   ├── NotificationsScreen.tsx # Invitation inbox
│   │   ├── ExportImportScreen.tsx  # CSV/PDF export + import
│   │   ├── SettingsScreen.tsx      # Theme, profile, members, about
│   │   ├── EditProfileScreen.tsx   # Name update
│   │   ├── PrivacyPolicyScreen.tsx # Full privacy policy
│   │   └── TermsScreen.tsx        # Full terms & conditions
│   ├── services/
│   │   ├── supabase.ts             # Chunked SecureStore client
│   │   ├── authService.ts          # OTP + Google OAuth
│   │   ├── booksService.ts         # Books CRUD
│   │   ├── entriesService.ts       # Entries CRUD + paginated
│   │   ├── invitationsService.ts   # Invites + members
│   │   ├── localDb.ts              # AsyncStorage offline cache
│   │   ├── syncService.ts          # Offline queue replay
│   │   ├── exportService.ts        # CSV/PDF export + CSV import
│   │   └── notificationService.ts  # Expo push notifications
│   ├── store/
│   │   ├── authStore.ts            # Session + user profile
│   │   ├── booksStore.ts           # Books (offline-first)
│   │   ├── entriesStore.ts         # Entries (offline-first)
│   │   ├── offlineStore.ts         # Network state + op queue
│   │   ├── inboxStore.ts           # Unread invitation count
│   │   └── themeStore.ts           # Light/dark preference
│   ├── hooks/
│   │   ├── useEntriesRealtime.ts   # Supabase realtime entries
│   │   ├── useOfflineSync.ts       # Auto-sync on reconnect
│   │   └── usePushNotifications.ts # Device registration + listener
│   ├── navigation/index.tsx        # Stack + tab navigators
│   ├── components/common/
│   │   └── OfflineBanner.tsx       # Animated offline/sync indicator
│   ├── types/index.ts
│   ├── constants/index.ts          # Design tokens
│   └── utils/index.ts
├── supabase/
│   ├── migrations/
│   │   ├── 001_schema.sql
│   │   ├── 002_fix_rls.sql
│   │   └── 003_fix_rls_final.sql
│   └── functions/
│       └── send-invite/index.ts    # Resend email edge function
└── production.md                   # Play Store + Expo publish guide
```

---

## 🔐 Security

- Row Level Security on all tables — users only access their own data
- JWT tokens chunked across SecureStore keys to bypass 2KB limit
- SECURITY DEFINER functions for invitation accept/reject
- Trigger functions use `SET search_path = public, pg_temp`

---

## 📦 New Packages (run `npm install`)

| Package | Purpose |
|---------|---------|
| `@react-native-community/datetimepicker` | Native date+time picker |
| `expo-notifications` | Push notification infrastructure |
| `expo-device` | Physical device detection |

---

## 🗺️ Roadmap

See `agents.md` for detailed future scope checkpoints.

---

## 📝 License

MIT © 2026 CashFlow
