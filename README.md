# 💰 CashFlow

A production-grade mobile expense tracker built with React Native (Expo) + Supabase.

Track cash flow across multiple ledger books, collaborate in real time, and invite team members.

---

## ✨ Features

- **Magic Link Auth** — Sign in via email OTP, no passwords
- **Multiple Books** — Create separate ledgers for Personal, Business, Family, etc.
- **Cash In / Cash Out** — Track every transaction with notes
- **Real-Time Sync** — Collaborators see changes instantly
- **Invite System** — Invite others by email, accept/reject invitations
- **Running Balance** — Always see your current position
- **Optimistic UI** — Instant feedback, no loading spinners on actions

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native (Expo ~51) |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| State | Zustand |
| Navigation | React Navigation v6 |
| Storage | Expo SecureStore |
| Email | Resend (free tier) via Supabase Edge Function |

---

## 🚀 Setup

### Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Supabase account (free)
- Resend account (free, for invite emails)

### 1. Clone & Install

```bash
git clone <your-repo>
cd cashflow
npm install
```

### 2. Create Supabase Project

1. Go to https://supabase.com → New project
2. Copy your **Project URL** and **anon public key**

### 3. Run Database Migration

1. Open Supabase → SQL Editor
2. Copy the entire contents of `supabase/migrations/001_schema.sql`
3. Paste and click **Run**

### 4. Enable Realtime

1. Supabase → Database → Replication
2. Enable for tables: `entries`, `book_members`, `invitations`

### 5. Configure Auth

1. Supabase → Authentication → URL Configuration
2. Add to **Redirect URLs**: `cashflow://auth/callback`
3. Disable email confirmations (Settings → Auth → Email)

### 6. Set Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 7. Deploy Edge Function (for invite emails)

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Set secrets (get RESEND_API_KEY from resend.com)
supabase secrets set RESEND_API_KEY=re_your_key
supabase secrets set APP_URL=cashflow://auth/callback

# Deploy function
supabase functions deploy send-invite
```

### 8. Run the App

```bash
npx expo start
```

Scan the QR code with **Expo Go** app on your phone.

---

## 📁 Project Structure

```
cashflow/
├── App.tsx                     # Entry point
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── VerifyOtpScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── BookDetailScreen.tsx
│   │   ├── AddEditEntryScreen.tsx
│   │   ├── CreateBookScreen.tsx
│   │   ├── MembersScreen.tsx
│   │   └── NotificationsScreen.tsx
│   ├── services/
│   │   ├── supabase.ts          # Supabase client
│   │   ├── authService.ts       # Auth operations
│   │   ├── booksService.ts      # Books CRUD
│   │   ├── entriesService.ts    # Entries CRUD
│   │   └── invitationsService.ts # Invites + members
│   ├── store/
│   │   ├── authStore.ts         # Zustand auth state
│   │   ├── booksStore.ts        # Zustand books state
│   │   └── entriesStore.ts      # Zustand entries state (with optimistic updates)
│   ├── hooks/
│   │   └── useEntriesRealtime.ts # Supabase Realtime hooks
│   ├── navigation/
│   │   └── index.tsx            # Stack + Tab navigators
│   ├── types/
│   │   └── index.ts             # TypeScript interfaces
│   ├── constants/
│   │   └── index.ts             # Colors, spacing, config
│   └── utils/
│       └── index.ts             # Formatters, validators
├── supabase/
│   ├── migrations/
│   │   └── 001_schema.sql       # Full DB schema + RLS
│   └── functions/
│       └── send-invite/
│           └── index.ts         # Email edge function
└── agents.md                   # Project context & progress
```

---

## 🔐 Security Model

All data access is protected by **Row Level Security (RLS)** in PostgreSQL:

- Users can only see books they're members of
- Only book owners can delete books or rename them
- Entries are accessible to all book members
- Invitations are only visible to the sender and recipient
- Accepting/rejecting invitations is handled by secure DB functions

---

## 🗺️ Roadmap

- [ ] Offline-first support (WatermelonDB)
- [ ] Push notifications (Expo Push)
- [ ] Monthly analytics charts
- [ ] CSV export
- [ ] Dark mode

---

## 📝 License

MIT
