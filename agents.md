# CashFlow — Agent Progress & Context

> **Project:** CashFlow — Multi-Book Expense Tracker  
> **Target:** Production-grade React Native (Expo) + Supabase application  
> **Inspired by:** Cashbook by Obopay  
> **Status:** 🟢 Phase 5 Complete — Offline, Export/Import added

---

## 📋 Project Summary

CashFlow is a mobile expense tracking app where users can:
- Manage multiple **Books** (ledgers)
- Track **Cash In / Cash Out** entries per book
- Work fully **offline** — all CRUD queued and synced when back online
- **Export** entries as CSV or PDF, **import** from CSV
- **Collaborate** in real time with other users
- Receive and send **invitations** to shared books

---

## 🏗️ Architecture Overview

```
CashFlow/
├── App.tsx                          # Entry — mounts useOfflineSync
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── VerifyOtpScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── BookDetailScreen.tsx     # ⬇️ + 👥 buttons in header
│   │   ├── AddEditEntryScreen.tsx
│   │   ├── CreateBookScreen.tsx
│   │   ├── MembersScreen.tsx
│   │   ├── NotificationsScreen.tsx
│   │   └── ExportImportScreen.tsx   # NEW: CSV/PDF export + CSV import
│   ├── components/
│   │   └── common/
│   │       └── OfflineBanner.tsx    # NEW: animated offline/sync indicator
│   ├── services/
│   │   ├── supabase.ts
│   │   ├── authService.ts
│   │   ├── booksService.ts
│   │   ├── entriesService.ts
│   │   ├── invitationsService.ts
│   │   ├── localDb.ts               # NEW: AsyncStorage local cache
│   │   ├── syncService.ts           # NEW: replay offline queue → Supabase
│   │   └── exportService.ts         # NEW: CSV/PDF export + CSV import parser
│   ├── store/
│   │   ├── authStore.ts
│   │   ├── booksStore.ts            # UPDATED: offline-first (enqueues ops)
│   │   ├── entriesStore.ts          # UPDATED: offline-first (enqueues ops)
│   │   └── offlineStore.ts          # NEW: network state + pending queue
│   ├── hooks/
│   │   ├── useEntriesRealtime.ts
│   │   └── useOfflineSync.ts        # NEW: auto-sync on reconnect
│   ├── navigation/index.tsx         # UPDATED: ExportImport + OfflineBanner
│   ├── types/index.ts
│   ├── constants/index.ts
│   └── utils/index.ts
├── supabase/
│   ├── migrations/001_schema.sql
│   └── functions/send-invite/index.ts
└── agents.md
```

---

## 🗄️ Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Extended user info (linked to auth.users) |
| `books` | Ledger/book records owned by users |
| `book_members` | Many-to-many: users ↔ books (role: owner/member) |
| `entries` | Cash in/out entries per book |
| `invitations` | Pending/accepted/rejected invite records |

### Key Relationships
```
auth.users (1) ──→ (N) profiles
profiles (1) ──→ (N) books [as owner]
books (M) ←──→ (N) profiles [via book_members]
books (1) ──→ (N) entries
books (1) ──→ (N) invitations
```

---

## 📴 Offline Architecture

### How It Works

```
User Action (offline)
        │
        ▼
Optimistic UI update  ──→  localDb (AsyncStorage cache)
        │
        ▼
offlineStore.enqueue(op)  ──→  AsyncStorage queue persisted
        │
        ▼  (network restored)
useOfflineSync detects isOnline = true
        │
        ▼
syncService.replayQueue(ops)
        │
   ┌────┴────┐
   ▼         ▼
Supabase  Supabase  (ops executed in order)
  CREATE   DELETE
        │
        ▼
succeeded ops removed from queue
localDb updated with real server IDs
booksStore.fetchBooks() refreshes UI
```

### Offline Operations Supported

| Operation | Queued Type |
|-----------|-------------|
| Create book | `CREATE_BOOK` |
| Update book | `UPDATE_BOOK` |
| Delete book | `DELETE_BOOK` |
| Create entry | `CREATE_ENTRY` |
| Update entry | `UPDATE_ENTRY` |
| Delete entry | `DELETE_ENTRY` |

### Conflict Strategy
- **Last-write-wins** for updates
- **Temp IDs** replaced with server IDs on sync
- **Rollback** on sync failure (UI reverts to last known state)
- Queue **persists across app restarts** (AsyncStorage)

---

## 📤 Export / Import

### CSV Export
- All entries fetched (no pagination limit)
- Header row + comment metadata lines
- One row per entry: Date, Type, Amount, Currency, Note, Added By
- Shared via native share sheet (`expo-sharing`)

### PDF Export
- Generates branded HTML report
- Summary card (balance / cash in / cash out)
- Full transaction table with color-coded types
- Rendered to PDF via `expo-print`
- Shared via native share sheet

### CSV Import
- User picks `.csv` file via `expo-document-picker`
- Parsed client-side (no server round-trip)
- Flexible column matching (case-insensitive headers)
- Type aliases accepted: `in/out/income/expense/credit/debit/+/-`
- Preview screen shows counts + warnings before confirming
- Entries inserted one-by-one (respects RLS)

### CSV Import Format
```
Date,Type,Amount,Note
2024-01-15,Cash In,500.00,Salary
2024-01-16,Cash Out,120.00,Groceries
```

---

## 🔐 Security Model (RLS)

| Policy | Rule |
|--------|------|
| Books read | Must be in `book_members` |
| Books write | Must be owner role |
| Entries read | Must be book member |
| Entries write | Must be book member |
| Invitations read | Inviter or invitee only |
| Invitations write | Only invitee can accept/reject |

---

## 📱 Screens

| Screen | Route | Status |
|--------|-------|--------|
| Splash/Onboarding | `/` | ✅ |
| Login (Magic Link) | `/auth/login` | ✅ |
| OTP Verify | `/auth/verify` | ✅ |
| Home (Books List) | `/home` | ✅ |
| Book Detail (Entries) | `/book/:id` | ✅ |
| Add/Edit Entry | `/book/:id/entry` | ✅ |
| Create/Edit Book | `/book/create` | ✅ |
| Members & Invites | `/book/:id/members` | ✅ |
| Notifications | `/notifications` | ✅ |
| Export & Import | `/book/:id/export` | ✅ NEW |

---

## 📦 Dependencies

| Package | Purpose |
|---------|---------|
| `expo ~51` | Framework |
| `react-native 0.74` | Core |
| `@supabase/supabase-js ^2` | Backend |
| `zustand ^4` | State management |
| `@react-navigation/*` | Navigation |
| `expo-secure-store` | Token storage |
| `@react-native-async-storage/async-storage` | Offline cache + queue |
| `@react-native-community/netinfo` | Network status |
| `expo-file-system` | File read/write for export |
| `expo-sharing` | Native share sheet |
| `expo-print` | PDF generation |
| `expo-document-picker` | CSV file import |
| `react-native-reanimated ~3` | Animations |
| `date-fns ^3` | Date formatting |

---

## ⚡ Phase Progress

### ✅ Phase 1 — Auth + Books CRUD
- [x] Supabase SQL schema + RLS
- [x] Auth service (magic link + OTP)
- [x] Books service + Zustand store
- [x] Login, OTP verify, Home screens

### ✅ Phase 2 — Entries CRUD + UI
- [x] Entries service + Zustand store
- [x] Book detail screen + filters
- [x] Add/Edit entry screen
- [x] Running balance, optimistic UI

### ✅ Phase 3 — Collaboration (Invites)
- [x] Invitations service
- [x] Send/Accept/Reject invite flows
- [x] Members screen

### ✅ Phase 4 — Realtime + Polish
- [x] Supabase Realtime hooks
- [x] Empty/loading/error states
- [x] Offline banner component

### ✅ Phase 5 — Advanced Features
- [x] **Offline-first CRUD** with persistent queue (AsyncStorage)
- [x] **Auto-sync** on reconnect + app foreground
- [x] **CSV export** via expo-sharing
- [x] **PDF export** via expo-print
- [x] **CSV import** with preview + validation

---

## 🔧 Environment Variables

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Supabase Edge Function secrets (set via `supabase secrets set`):
```
RESEND_API_KEY=re_xxxx
APP_URL=cashflow://auth/callback
```

---

## 🚀 Setup Instructions

### 1. Supabase
1. New project at https://supabase.com
2. SQL Editor → paste `supabase/migrations/001_schema.sql` → Run
3. Database → Replication → enable for `entries`, `book_members`, `invitations`
4. Authentication → URL Config → add `cashflow://auth/callback` to Redirect URLs

### 2. App
```bash
npm install
cp .env.example .env   # fill in Supabase URL + anon key
npx expo start
```

### 3. Edge Function (invite emails)
```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set RESEND_API_KEY=re_xxx APP_URL=cashflow://auth/callback
supabase functions deploy send-invite
```

---

## 🧠 Key Engineering Decisions

| Decision | Rationale |
|----------|-----------|
| AsyncStorage for offline queue | Zero native dependencies, ships with Expo |
| Sequential queue replay | Preserves operation order; avoids race conditions |
| Temp ID replacement | Optimistic UI works without knowing server ID upfront |
| CSV parser (client-side) | No server round-trip; works offline; instant feedback |
| expo-print for PDF | Zero native deps; generates HTML→PDF on-device |
| Last-write-wins | Simpler than CRDTs for this use case; acceptable for personal finance |

---

*All phases complete. Ready for app store submission.*
