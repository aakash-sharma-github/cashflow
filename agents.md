# CashFlow — Agent Progress & Context

> **Project:** CashFlow — Multi-Book Expense Tracker  
> **Stack:** React Native (Expo ~51) + Supabase  
> **Version:** 1.2.0  
> **Status:** 🟢 Production Ready

---

## 📋 Project Summary

CashFlow is a mobile-first expense tracking app with multi-book ledgers, real-time collaboration, offline-first CRUD, CSV/PDF export, push notifications, dark/light mode, and in-app legal screens.

---

## 🏗️ Architecture

```
cashflow/
├── App.tsx                     ← boot: initialize + theme + offline sync + push
├── assets/                     ← icon.png, splash.png, adaptive-icon.png, notification-icon.png
├── src/
│   ├── screens/ (13 screens)
│   ├── services/ (9 services)
│   ├── store/ (6 Zustand stores)
│   ├── hooks/ (3 hooks)
│   ├── navigation/             ← Stack + Tab + theme-aware
│   ├── components/common/
│   └── types, constants, utils
├── supabase/
│   ├── migrations/ (3 SQL files)
│   └── functions/send-invite/
└── production.md
```

---

## 🗄️ Database Schema

| Table | Purpose |
|-------|---------|
| `profiles` | Users (id, email, full_name, avatar_url, push_token) |
| `books` | Ledger books (name, color, currency, owner_id) |
| `book_members` | Many-to-many users↔books (role: owner/member) |
| `entries` | Cash in/out transactions |
| `invitations` | Pending/accepted/rejected invites |

---

## ✅ Completed Phases

### Phase 1 — Auth + Books CRUD
- [x] Email magic link (OTP)
- [x] Google OAuth
- [x] SecureStore chunking (>2KB fix)
- [x] Books CRUD with offline-first
- [x] RLS policies (003_fix_rls_final.sql)

### Phase 2 — Entries CRUD + UI
- [x] Entries CRUD with optimistic updates
- [x] Native date + time picker (iOS modal / Android sequential)
- [x] Filter by All / Cash In / Cash Out
- [x] Paginated entries list

### Phase 3 — Collaboration
- [x] Email invitations via Resend edge function
- [x] Accept / Reject invitations
- [x] Book member management
- [x] Real-time sync via Supabase Realtime

### Phase 4 — Offline First
- [x] AsyncStorage local cache (books + entries)
- [x] Persistent operation queue (survives restarts)
- [x] Auto-sync on reconnect / app foreground
- [x] Animated offline banner

### Phase 5 — Export / Import
- [x] CSV export (all entries, native share sheet)
- [x] PDF export (branded report via expo-print)
- [x] CSV import with preview + validation

### Phase 6 — Push Notifications + Badge
- [x] Expo push token registration on device
- [x] Token saved to profiles.push_token
- [x] Realtime listener fires local notification on new invite
- [x] Inbox tab badge (red dot) with live count
- [x] Badge clears when app comes to foreground

### Phase 7 — UI/UX Polish
- [x] Dark / Light mode with persistence
- [x] All screens fully dark-mode aware (inline theme props only — no StyleSheet.create() violations)
- [x] @expo/vector-icons Ionicons throughout
- [x] expo-linear-gradient on key surfaces
- [x] Edit Profile (name update)
- [x] In-app Privacy Policy screen
- [x] In-app Terms & Conditions screen
- [x] Members section shows unique invited people only (excludes self)

---

## 🔭 Future Scope Checkpoints

### 🔲 FP-01 — Monthly Analytics Dashboard
**Priority: High**
- Aggregate entries by month using Supabase RPC
- Bar chart (cash in vs out per month) using recharts/Victory
- Month-over-month comparison
- Category tagging on entries (Food, Transport, Salary, etc.)
- Pie chart breakdown by category
- Export analytics as PDF

### 🔲 FP-02 — Category & Tag System
**Priority: High**
- Add `category` field to entries table (migration required)
- Predefined categories: Food, Transport, Housing, Salary, Business, Other
- Custom category creation per book
- Filter entries by category
- Category icons + colors
- Budget limits per category with alert when exceeded

### 🔲 FP-03 — Recurring Entries
**Priority: Medium**
- Mark entry as recurring (daily / weekly / monthly / custom)
- Auto-generate upcoming entries
- `recurring_entries` table with frequency + next_date
- Notifications before recurring entry is due

### 🔲 FP-04 — Multi-Currency & Exchange Rates
**Priority: Medium**
- Fetch live exchange rates (free API: exchangerate-api.com)
- Display all book balances in a single base currency on HomeScreen
- Per-entry currency override
- Historical rate snapshots stored with entry

### 🔲 FP-05 — Advanced Export
**Priority: Medium**
- Export date range filter (e.g., last 30 days, custom range)
- Export by category
- Excel (.xlsx) export using SheetJS
- Scheduled weekly email reports via Edge Function

### 🔲 FP-06 — Notifications Center
**Priority: Medium**
- Full notification history screen (not just pending invites)
- Notification types: new entry by collaborator, balance threshold alert, recurring entry reminder
- Mark as read / clear all
- Push notification deep links (tap notification → open relevant book)

### 🔲 FP-07 — Biometric / PIN Lock
**Priority: Medium**
- Optional app-level lock using expo-local-authentication
- FaceID / TouchID on iOS
- Fingerprint on Android
- PIN fallback
- Auto-lock timeout setting

### 🔲 FP-08 — Widgets (iOS / Android)
**Priority: Low**
- Home screen widget showing total balance
- Quick-add entry widget
- Requires bare workflow or expo-widgets (experimental)

### 🔲 FP-09 — Web Version
**Priority: Low**
- Expo Web build for the main CRUD flows
- Shared codebase, responsive layout
- Useful for desktop entry on larger amounts

### 🔲 FP-10 — Audit Log
**Priority: Low**
- `entry_history` table: who changed what and when
- Visible per-entry in a "History" modal
- Useful for business/team accountability

### 🔲 FP-11 — Book Templates
**Priority: Low**
- Pre-configured book templates (Personal Budget, Travel Expenses, Project Budget)
- Starter entries / categories
- Import template when creating a new book

### 🔲 FP-12 — Supabase Edge Function: Smart Summaries
**Priority: Low**
- Weekly AI-generated spending insights via Edge Function + Claude API
- "You spent 23% more on Food this week"
- Delivered as push notification + in-app card

---

## 🔧 Environment Variables

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_EAS_PROJECT_ID=your-eas-project-id
```

Edge Function secrets (set via `supabase secrets set`):
```
RESEND_API_KEY=re_xxxx
APP_URL=cashflow://auth/callback
```

---

## 🐛 Known Issues / Technical Debt

| Issue | Status | Notes |
|-------|--------|-------|
| Push tokens only work on physical device | By design | Expo Go simulator limitation |
| Offline sync is last-write-wins | Acceptable | No CRDT needed at this scale |
| No pagination on Settings members list | Low priority | Most users have <20 members |
| Google OAuth redirect URI varies per environment | Documented | See production.md |

---

## 📦 All Dependencies

```json
"@expo/vector-icons": "^14.0.2",
"@react-native-async-storage/async-storage": "1.23.1",
"@react-native-community/datetimepicker": "8.2.0",
"@react-native-community/netinfo": "11.3.2",
"@react-navigation/bottom-tabs": "^6.5.20",
"@react-navigation/native": "^6.1.17",
"@react-navigation/stack": "^6.3.29",
"@supabase/supabase-js": "^2.43.5",
"date-fns": "^3.6.0",
"expo": "~51.0.18",
"expo-auth-session": "~5.5.2",
"expo-build-properties": "~0.12.3",
"expo-device": "~6.0.2",
"expo-document-picker": "~12.0.2",
"expo-file-system": "~17.0.1",
"expo-linear-gradient": "~13.0.2",
"expo-notifications": "~0.28.9",
"expo-print": "~13.0.1",
"expo-secure-store": "~13.0.2",
"expo-sharing": "~12.0.1",
"expo-status-bar": "~1.12.1",
"expo-web-browser": "~13.0.3",
"react": "18.2.0",
"react-native": "0.74.3",
"react-native-gesture-handler": "~2.17.1",
"react-native-reanimated": "~3.10.1",
"react-native-safe-area-context": "4.10.5",
"react-native-screens": "3.31.1",
"zustand": "^4.5.4"
```

---

*v1.2.0 — Production Ready. See production.md for publishing guide.*
