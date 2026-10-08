# Changelog

All notable changes to CashFlow are documented here.

## [1.4.5] - 2026-10-05

### Added

- Owner-authorized delete-all for book entries, including offline queue and cache reconciliation support.
- A cooldown for repeated OTP requests and clearer feedback for rate limits, expired or invalid codes, and connection failures.
- Regression coverage for empty-cache reconciliation, large import batching, and grouped amount formatting.

### Changed

- Import entries in batches of 500 instead of 100 to reduce sequential database requests for large CSV files.
- Format amounts with thousands separators, omit zero cents, preserve meaningful cents, and retain negative balances.
- Show entry edit and delete actions only to the entry author or book owner.
- Show the inviter's existing profile name or email to recipients of pending book invitations.
- Exclude the authenticated actor from entry-change push notifications, including edits and deletes of entries created by another member.

### Security

- Added RLS policies limiting entry edits and deletes to the author or book owner, plus an owner-only database function for delete-all.
- Added profile visibility for a pending invitee only when needed to identify the inviter.

### Database migration

- Apply `supabase/migrations/20261005120000_collaboration_permissions_delete_all.sql` to each Supabase environment before releasing the updated client. It has not been applied to the connected project as part of this change.