# Changelog

All notable changes to CashFlow are documented here.

## [1.4.3] - 2026-10-05

### Added

- Complete, paginated CSV and PDF exports with server-side count checks to detect incomplete exports.
- Explicit export errors when the complete dataset cannot be verified or the book has unsynchronized entry changes.
- Profile and entry-field access restrictions for collaborators and authenticated API clients.

### Changed

- Load the visible entry page and authoritative book summary concurrently.
- Avoid an extra Auth user request before read-only queries; Postgres RLS remains authoritative.
- Refresh book metadata without repeating its financial-summary query.
- Load collaborator details across multiple books in one request.
- Show the installed app and native build versions in Settings, and synchronize native version fields through the release bump script.
- Reduce the Android JavaScript bundle by importing only the Ionicons font used by the app.
- Limit default Android builds to ARM phone architectures; x86 emulator builds can override the ABI property.

### Security

- Keep profile push tokens unavailable to ordinary client queries.
- Revoke `TRUNCATE` privileges from public API roles and limit entry updates to editable fields, protecting entry ownership, book association, and timestamps.
