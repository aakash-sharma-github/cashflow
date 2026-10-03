-- Read-only catalog contract checks for Phase 1. Run after applying the migration.
DO $checks$
DECLARE
  v_definition text;
BEGIN
  IF has_table_privilege('authenticated', 'public.book_members', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated still has direct book_members INSERT';
  END IF;
  IF has_table_privilege('authenticated', 'public.invitations', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated still has direct invitations UPDATE';
  END IF;
  IF has_table_privilege('authenticated', 'public.profiles', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated still has direct profiles INSERT';
  END IF;
  IF has_table_privilege('authenticated', 'public.profiles', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated still has unrestricted profiles UPDATE';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated is missing expected profile name/avatar updates';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.profiles', 'push_token', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can update protected profile fields';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'book_members'
      AND cmd = 'INSERT' AND 'authenticated' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'authenticated book_members INSERT policy remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invitations'
      AND cmd = 'UPDATE' AND 'authenticated' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'authenticated invitations UPDATE policy remains';
  END IF;

  SELECT pg_get_functiondef('public.accept_invitation(uuid)'::regprocedure) INTO v_definition;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.accept_invitation(uuid)'::regprocedure)
     OR v_definition NOT LIKE '%auth.users%'
     OR v_definition NOT LIKE '%email_confirmed_at%'
     OR v_definition NOT LIKE '%FOR UPDATE%'
     OR v_definition NOT LIKE '%''member''%' THEN
    RAISE EXCEPTION 'accept_invitation SECURITY DEFINER contract is incorrect';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.accept_invitation(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.accept_invitation(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'accept_invitation grants are incorrect';
  END IF;

  SELECT pg_get_functiondef('public.reject_invitation(uuid)'::regprocedure) INTO v_definition;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.reject_invitation(uuid)'::regprocedure)
     OR v_definition NOT LIKE '%auth.users%'
     OR v_definition NOT LIKE '%email_confirmed_at%'
     OR v_definition NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'reject_invitation SECURITY DEFINER contract is incorrect';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.reject_invitation(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reject_invitation(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'reject_invitation grants are incorrect';
  END IF;
END;
$checks$;
