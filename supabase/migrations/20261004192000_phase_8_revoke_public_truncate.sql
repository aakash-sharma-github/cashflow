-- PostgreSQL TRUNCATE bypasses row-level security. Prevent API roles from
-- truncating any public application table, including books, memberships,
-- invitations, profiles, and entries.
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Keep the restriction for future public tables created by the migration role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM PUBLIC, anon, authenticated;
