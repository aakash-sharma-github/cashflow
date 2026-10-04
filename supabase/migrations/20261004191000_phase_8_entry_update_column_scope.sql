-- Collaborators may edit financial content in a shared book, but must not be
-- able to forge the creator, move an entry, or rewrite server timestamps.
REVOKE UPDATE ON TABLE public.entries FROM authenticated;
REVOKE UPDATE (id, book_id, user_id, amount, type, note, entry_date, created_at, updated_at)
  ON TABLE public.entries FROM PUBLIC, anon, authenticated;
GRANT UPDATE (amount, type, note, entry_date)
  ON TABLE public.entries TO authenticated;
