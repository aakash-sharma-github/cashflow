# CashFlow — Agent Progress & Context

> **Project:** CashFlow — Multi-Book Expense Tracker  
> **Stack:** React Native (Expo ~51) + Supabase  
> **Status:** 🟢 v1.1 Complete — All issues resolved, UI redesigned

---

## 📋 Project Summary

CashFlow is a mobile expense tracking app: multiple ledger books, cash in/out entries, real-time collaboration, offline-first CRUD, CSV/PDF export, CSV import, and Google OAuth.

---

## 🏗️ Architecture

```
CashFlow/
├── App.tsx
├── src/
│   ├── screens/           — 10 screens, all redesigned v2
│   ├── components/
│   │   └── common/
│   │       └── OfflineBanner.tsx
│   ├── services/
│   │   ├── supabase.ts        — chunked SecureStore (fixes >2KB warning)
│   │   ├── authService.ts     — OTP + Google OAuth
│   │   ├── booksService.ts
│   │   ├── entriesService.ts
│   │   ├── invitationsService.ts
│   │   ├── localDb.ts         — AsyncStorage offline cache
│   │   ├── syncService.ts     — queue replay on reconnect
│   │   └── exportService.ts   — CSV/PDF export + CSV import
│   ├── store/
│   │   ├── authStore.ts       — + signInWithGoogle action
│   │   ├── booksStore.ts      — offline-first
│   │   ├── entriesStore.ts    — offline-first
│   │   └── offlineStore.ts    — network state + persistent queue
│   ├── hooks/
│   │   ├── useEntriesRealtime.ts
│   │   └── useOfflineSync.ts
│   ├── navigation/index.tsx   — redesigned tab bar + gradient splash
│   ├── types/index.ts
│   ├── constants/index.ts     — Design System v2
│   └── utils/index.ts
├── supabase/
│   ├── migrations/
│   │   ├── 001_schema.sql     — full schema + original RLS
│   │   └── 002_fix_rls.sql    — CRITICAL: run this to fix book creation
│   └── functions/
│       └── send-invite/index.ts
└── agents.md
```

---

## 🐛 Issues Fixed (v1.1)

### Issue 1 — Google Sign-In ✅
- Added `expo-web-browser` + `expo-auth-session`
- `authService.signInWithGoogle()` opens browser OAuth flow
- Handles both implicit (hash token) and PKCE (code exchange) flows
- `authStore.signInWithGoogle()` exposed to UI
- LoginScreen has "Continue with Google" button

### Issue 2 — RLS blocks book creation ✅
**Root cause:** The `book_members` INSERT policy called `is_book_owner(book_id)` which queries `book_members` — but the new book's owner row doesn't exist yet when the `on_book_created` trigger fires. Even though the trigger function is `SECURITY DEFINER`, the RLS check on `book_members` ran in the user context and found no owner membership (circular dependency).

**Fix (migration 002):**
- Dropped the problematic `"System inserts members (via functions)"` policy
- Added simpler `"Allow member self-insert"` policy: `auth.uid() = user_id`
- Added `SET search_path = public` to all SECURITY DEFINER functions
- Updated `handle_new_user` to use `ON CONFLICT DO UPDATE` (supports Google OAuth re-login)
- Added `INSERT` policy for `profiles` (needed when Google creates a new user)

**⚠️ To apply:** Run `supabase/migrations/002_fix_rls.sql` in Supabase SQL Editor

### Issue 3 — SecureStore >2KB warning ✅
**Root cause:** Supabase stores the entire session JSON (access token + refresh token + user metadata) as a single value. Supabase auth library uses keys like `sb-[project]-auth-token` which stores ~3–5KB of JSON in one SecureStore entry. SecureStore on iOS has a 2048-byte soft limit.

**Fix:** `src/services/supabase.ts` now uses `ChunkedSecureStore` adapter:
- Values ≤1800 bytes → written directly (single key)
- Values >1800 bytes → split into chunks, stored as `key_chunk_0`, `key_chunk_1`, etc.
- Chunk count stored separately as `key__chunks`
- Read reconstructs all chunks in order
- `removeItem` cleans up all chunk keys

### Issue 4 — UI/UX Redesign ✅
Full redesign using `@expo/vector-icons` (Ionicons) + `expo-linear-gradient`:

| Screen | Changes |
|--------|---------|
| LoginScreen | Hero gradient, circle decorations, Google button with logo icon |
| VerifyOtpScreen | Gradient icon, progress bar, animated verify button |
| HomeScreen | Net balance gradient card, icon-enriched book cards, greeting |
| BookDetailScreen | Gradient summary card, icon filter tabs, header action buttons |
| AddEditEntryScreen | Icon type toggle with pill indicator, clear button |
| CreateBookScreen | Live preview card updates as you type |
| NotificationsScreen | Gradient badge, icon-rich invite cards |
| MembersScreen | Gradient avatars, icon status pills, icon send button |
| ExportImportScreen | Section icons, code card with syntax color, preview stats |
| Navigation | Gradient splash screen, active tab pill highlight |

**Design tokens (constants/index.ts):**
- Primary: `#5B5FED` / `#7C3AED` (indigo → violet gradient)
- Cash In: `#00C48C` (emerald)
- Cash Out: `#FF647C` (coral)
- Background: `#F5F7FF` (cool tinted white)
- Shadows use brand color tinting

---

## 📦 New Dependencies (v1.1)

| Package | Why |
|---------|-----|
| `expo-linear-gradient ~13` | Gradient cards, buttons, splash |
| `expo-auth-session ~5.5` | Google OAuth PKCE flow |
| `expo-web-browser ~13` | OAuth browser popup |
| `@expo/vector-icons ^14` | Ionicons throughout app |

---

## 🔐 Security Model

| Table | Policy |
|-------|--------|
| profiles | Read own + co-members; Insert own (for Google OAuth) |
| books | Read if member; Insert if owner_id = auth.uid() |
| book_members | Read if member; Insert if user_id = auth.uid() (self only) |
| entries | Full CRUD if book member |
| invitations | Read by inviter/invitee; Update (accept/reject) by invitee |

---

## 🗄️ Database Schema

Run in order:
1. `supabase/migrations/001_schema.sql` — create all tables + original RLS
2. `supabase/migrations/002_fix_rls.sql` — fix RLS book creation bug ← **required**

---

## 🔧 Environment

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Supabase Dashboard → Authentication → Providers → Google:
- Enable Google provider
- Add your Google OAuth Client ID + Secret
- Authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`

---

## 🚀 Quick Start

```bash
npm install
cp .env.example .env    # fill in Supabase keys
npx expo start
```

SQL (run both in Supabase SQL Editor):
1. `001_schema.sql`
2. `002_fix_rls.sql`

---

## ⚡ Phase Progress

- ✅ Phase 1 — Auth + Books CRUD
- ✅ Phase 2 — Entries CRUD + UI
- ✅ Phase 3 — Collaboration (Invites)
- ✅ Phase 4 — Realtime + Polish
- ✅ Phase 5 — Offline + Export/Import
- ✅ Phase 6 — Bug fixes + Google OAuth + UI redesign

---

*v1.1 — Production ready.*
