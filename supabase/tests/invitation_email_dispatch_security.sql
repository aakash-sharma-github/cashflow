-- Read-only catalog assertions for the invitation dispatch boundary.
DO $checks$
DECLARE
  v_function oid := 'public.claim_invitation_email_dispatch(uuid,uuid)'::regprocedure;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class
          WHERE oid = 'public.invitation_email_dispatches'::regclass) THEN
    RAISE EXCEPTION 'invitation dispatch table must have RLS enabled';
  END IF;
  IF has_table_privilege('anon', 'public.invitation_email_dispatches', 'SELECT')
     OR has_table_privilege('authenticated', 'public.invitation_email_dispatches', 'SELECT')
     OR has_table_privilege('anon', 'public.invitation_email_dispatches', 'INSERT')
     OR has_table_privilege('authenticated', 'public.invitation_email_dispatches', 'INSERT') THEN
    RAISE EXCEPTION 'client role can access invitation dispatch table';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_function)
     OR NOT has_function_privilege('service_role', v_function, 'EXECUTE')
     OR has_function_privilege('anon', v_function, 'EXECUTE')
     OR has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'claim RPC owner mode or grants are incorrect';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc AS p
    CROSS JOIN LATERAL unnest(p.proconfig) AS setting
    WHERE p.oid = v_function AND setting = 'search_path=""'
  ) THEN
    RAISE EXCEPTION 'claim RPC must use an empty search_path';
  END IF;
  IF pg_get_functiondef(v_function) NOT LIKE '%pg_advisory_xact_lock%'
     OR pg_get_functiondef(v_function) NOT LIKE '%interval ''1 hour''%'
     OR pg_get_functiondef(v_function) NOT LIKE '%i.inviter_id = p_inviter_id%'
     OR pg_get_functiondef(v_function) NOT LIKE '%i.status = ''pending''%' THEN
    RAISE EXCEPTION 'claim RPC authorization, replay, or rate limit check is missing';
  END IF;
END;
$checks$;
