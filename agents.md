# CashFlow — Agent Context & Progress

> **Stack:** React Native (Expo ~51) + Supabase  
> **Version:** 1.0.0 (see app.json — single source of truth)  
> **Status:** 🟢 Production Ready

---

## 🏗️ Architecture

```
App.tsx         → boot: initialize() + loadTheme() + loadTodos() in parallel
                  ThemedAlertProvider at root (above NavigationContainer)
navigation/     → Stack + Tab + theme-aware modal contentStyle
screens/        → 13 screens, all inline theme props (zero StyleSheet.create violations)
services/       → 9 services: supabase, auth, books, entries, invitations,
                  localDb, sync, export, notifications
store/          → 7 Zustand stores: auth, books, entries, offline, inbox, theme, todo
hooks/          → useEntriesRealtime, useOfflineSync, usePushNotifications
components/     → OfflineBanner, ThemedAlert (dialog + action sheet)
utils/version   → reads APP_VERSION / BUILD_NUMBER from expo-constants at runtime
```

---

## 🗄️ Database

**Run migrations in order: 001 → 002 → 003 → 004**

Migration 004 is definitive — it:
1. Clears ALL book_members INSERT policies using a DO block
2. Adds a single simple policy: `WITH CHECK (auth.uid() = user_id)`
3. Sets `OWNER TO postgres` on all SECURITY DEFINER functions
4. Recreates accept/reject invitation functions with proper ownership

**Tables:** `profiles`, `books`, `book_members`, `entries`, `invitations`

**Critical:** `profiles` needs a `push_token` column (added in migration or manually):
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token TEXT;
```

---

## ✅ Completed Phases

### Phase 1 — Auth + Books
- [x] Magic link OTP + Google OAuth
- [x] ChunkedSecureStore (>2KB session fix)
- [x] Hard 8s timeout on initialize() — splash never freezes
- [x] Books CRUD offline-first + RLS (migration 004)

### Phase 2 — Entries
- [x] Entries CRUD with optimistic updates
- [x] Native date+time picker (iOS modal / Android ref-based sequential)
- [x] No KAV on Android (prevents scroll-disappear bug)
- [x] Filter All / In / Out + pagination

### Phase 3 — Collaboration
- [x] Email invitations (Resend edge function)
- [x] Accept/reject with SECURITY DEFINER functions
- [x] Real-time sync via Supabase Realtime
- [x] Inbox tab badge with live count

### Phase 4 — Offline
- [x] AsyncStorage local cache
- [x] Persistent operation queue (survives restarts)
- [x] Auto-sync on reconnect + animated OfflineBanner

### Phase 5 — Export / Import
- [x] CSV export + import
- [x] PDF export (expo-print branded report)
- [x] Excel export (.xlsx with summary sheet)
- [x] Excel import (.xlsx + .xlsm)

### Phase 6 — Notifications
- [x] Local notifications (no Firebase required)
- [x] Supabase Realtime invite listener fires local notification
- [x] Inbox badge red dot with count

### Phase 7 — UI Polish
- [x] Dark/light mode — zero StyleSheet.create violations (auto-checked)
- [x] ThemedAlert: animated dialog + bottom action sheet (replaces all Alert.alert)
- [x] Modal contentStyle fix (CreateBook, AddEditEntry, EditProfile now respect dark mode)
- [x] Entry long press → action sheet (Edit / Delete / Cancel)
- [x] Book long press → action sheet (Edit / Delete / Cancel)

### Phase 8 — Todos
- [x] Offline Zustand store → AsyncStorage persistence
- [x] Priority (High/Medium/Low) + search + filter
- [x] Animated checkbox, due date badges, notes
- [x] Add sheet + edit modal + swipe hints

### Phase 9 — Versioning
- [x] `app.json` is single source of truth for version
- [x] `eas.json` has `autoIncrement: true` for versionCode
- [x] `scripts/bump-version.js` → `npm run version:patch|minor|major`
- [x] `src/utils/version.ts` reads live version via expo-constants
- [x] Settings screen shows live version (never hardcoded)

---

## 🔭 Future Scope Checkpoints

### 🔲 FP-01 — Monthly Analytics Dashboard
- Bar chart: cash in vs out per month (Victory Native / react-native-chart-kit)
- Month-over-month delta indicator
- Category breakdown pie chart
- Export analytics as PDF

### 🔲 FP-02 — Category & Tag System
- `category` column on entries (migration required)
- Predefined + custom categories per book
- Filter entries by category
- Budget limits per category with over-budget alert

### 🔲 FP-03 — Recurring Entries
- `recurring_entries` table: frequency + next_date
- Auto-generate entries on schedule
- Reminder notification before due date

### 🔲 FP-04 — Multi-Currency + Live Rates
- Free exchange rate API (exchangerate-api.com)
- Show all books in one base currency on HomeScreen
- Per-entry currency override
- Historical rate snapshot stored with entry

### 🔲 FP-05 — Advanced Export
- Date range filter on export
- Export by category
- Scheduled weekly email report (Edge Function)

### 🔲 FP-06 — Deep Notification Center
- Full notification history (not just pending invites)
- Types: new entry by collaborator, balance threshold, recurring reminder
- Tap notification → deep link into relevant book

### 🔲 FP-07 — Biometric / PIN Lock
- expo-local-authentication (FaceID / TouchID / Fingerprint)
- Auto-lock timeout setting
- PIN fallback

### 🔲 FP-08 — Home Screen Widget
- Balance widget for iOS / Android home screen
- Requires bare workflow or expo-widgets (experimental)

### 🔲 FP-09 — Web Version
- Expo Web build for main CRUD flows
- Responsive layout, useful for desktop data entry

### 🔲 FP-10 — Audit Log
- `entry_history` table: who changed what, when
- Per-entry "History" modal
- Business accountability use case

### 🔲 FP-11 — Firebase Remote Push
- Add `google-services.json` to Android build
- Replace local notification with FCM remote push
- Works when app is closed / background
- Required for: balance alerts, scheduled reminders

### 🔲 FP-12 — AI Spending Insights
- Weekly Claude API summary via Edge Function
- "You spent 23% more on Food this week"
- In-app insight card + push notification

---

## 🐛 Known Issues / Tech Debt

| Issue | Severity | Notes |
|-------|----------|-------|
| Push only works when app is open | Medium | Local notifications only; FP-11 adds FCM |
| Offline sync is last-write-wins | Low | No CRDT; acceptable at current scale |
| No pagination on Settings members | Low | <20 members for most users |
| Google OAuth redirect varies per env | Info | Documented in production.md |

---

## 🔑 Environment Variables

```env
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_EAS_PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Supabase Edge Function secrets (set via `supabase secrets set`):
```
RESEND_API_KEY=re_xxxx
APP_URL=cashflow://auth/callback
```