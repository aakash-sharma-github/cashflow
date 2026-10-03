-- Read-only behavior and privilege checks for the server-side summary RPC.
DO $checks$
DECLARE
  v_user_id uuid;
  v_nonmember_book_id uuid;
  expected record;
  actual record;
  v_function oid := 'public.get_book_financial_summaries(uuid)'::regprocedure;
BEGIN
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_function)
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc AS p
       CROSS JOIN LATERAL unnest(p.proconfig) AS setting
       WHERE p.oid = v_function AND setting = 'search_path=""'
     ) THEN
    RAISE EXCEPTION 'summary RPC must be SECURITY DEFINER with empty search_path';
  END IF;
  IF NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
     OR has_function_privilege('anon', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'summary RPC grants are incorrect';
  END IF;
  IF pg_get_functiondef(v_function) NOT LIKE '%mine.user_id = auth.uid()%'
     OR pg_get_functiondef(v_function) NOT LIKE '%p_book_id IS NULL OR mine.book_id = p_book_id%' THEN
    RAISE EXCEPTION 'summary RPC membership authorization is missing';
  END IF;

  SELECT user_id INTO v_user_id FROM public.book_members LIMIT 1;
  IF v_user_id IS NULL THEN RETURN; END IF;
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  FOR expected IN
    SELECT mine.book_id,
           count(e.id)::bigint AS entry_count,
           coalesce(sum(e.amount) FILTER (WHERE e.type = 'cash_in'), 0::numeric) AS cash_in,
           coalesce(sum(e.amount) FILTER (WHERE e.type = 'cash_out'), 0::numeric) AS cash_out,
           (SELECT count(*)::bigint FROM public.book_members m WHERE m.book_id = mine.book_id) AS member_count
    FROM public.book_members mine
    LEFT JOIN public.entries e ON e.book_id = mine.book_id
    WHERE mine.user_id = v_user_id
    GROUP BY mine.book_id
  LOOP
    SELECT * INTO actual
    FROM public.get_book_financial_summaries(expected.book_id);
    IF NOT FOUND
       OR actual.entry_count IS DISTINCT FROM expected.entry_count
       OR actual.cash_in IS DISTINCT FROM expected.cash_in
       OR actual.cash_out IS DISTINCT FROM expected.cash_out
       OR actual.balance IS DISTINCT FROM expected.cash_in - expected.cash_out
       OR actual.member_count IS DISTINCT FROM expected.member_count THEN
      RAISE EXCEPTION 'summary mismatch for authorized book %', expected.book_id;
    END IF;
  END LOOP;

  SELECT b.id INTO v_nonmember_book_id
  FROM public.books b
  WHERE NOT EXISTS (
    SELECT 1 FROM public.book_members m
    WHERE m.book_id = b.id AND m.user_id = v_user_id
  )
  LIMIT 1;
  IF v_nonmember_book_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.get_book_financial_summaries(v_nonmember_book_id)
  ) THEN
    RAISE EXCEPTION 'summary RPC disclosed a nonmember book total';
  END IF;
END;
$checks$;
