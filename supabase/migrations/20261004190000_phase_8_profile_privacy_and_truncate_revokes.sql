-- Keep collaborator-visible identity fields, but prevent clients from reading
-- push tokens and internal profile timestamps. Profile rows remain protected
-- by the existing profiles_select/profiles_update RLS policies.
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE SELECT (id, email, full_name, avatar_url, push_token, created_at, updated_at)
  ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, email, full_name, avatar_url, push_token, created_at, updated_at)
  ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, email, full_name, avatar_url)
  ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url)
  ON TABLE public.profiles TO authenticated;

-- TRUNCATE is not constrained by RLS. Remove broad API-role table grants, then
-- give authenticated clients only the CRUD operations covered by entries RLS.
REVOKE ALL PRIVILEGES ON TABLE public.entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.entries TO authenticated;
