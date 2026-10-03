-- Aggregate finance totals in PostgreSQL. The function is SECURITY DEFINER so
-- PostgREST row caps and entry-row RLS cannot truncate/fragment totals. Access
-- is explicitly restricted to books with a membership for auth.uid().
CREATE OR REPLACE FUNCTION public.get_book_financial_summaries(p_book_id uuid DEFAULT NULL)
RETURNS TABLE (
  book_id uuid,
  entry_count bigint,
  cash_in numeric,
  cash_out numeric,
  balance numeric,
  member_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    mine.book_id,
    totals.entry_count,
    totals.cash_in,
    totals.cash_out,
    totals.cash_in - totals.cash_out AS balance,
    member_totals.member_count
  FROM public.book_members AS mine
  CROSS JOIN LATERAL (
    SELECT
      count(e.id)::bigint AS entry_count,
      coalesce(sum(e.amount) FILTER (WHERE e.type = 'cash_in'), 0::numeric) AS cash_in,
      coalesce(sum(e.amount) FILTER (WHERE e.type = 'cash_out'), 0::numeric) AS cash_out
    FROM public.entries AS e
    WHERE e.book_id = mine.book_id
  ) AS totals
  CROSS JOIN LATERAL (
    SELECT count(*)::bigint AS member_count
    FROM public.book_members AS all_members
    WHERE all_members.book_id = mine.book_id
  ) AS member_totals
  WHERE mine.user_id = auth.uid()
    AND (p_book_id IS NULL OR mine.book_id = p_book_id);
$function$;

ALTER FUNCTION public.get_book_financial_summaries(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_book_financial_summaries(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_book_financial_summaries(uuid) TO authenticated;
