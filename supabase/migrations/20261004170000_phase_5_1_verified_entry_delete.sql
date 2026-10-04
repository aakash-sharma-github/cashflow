-- Queue replay needs an authenticated, idempotent delete result. A direct
-- PostgREST DELETE can return zero rows under RLS without an error, which
-- must not be mistaken for a deleted row unless the row is truly absent.
CREATE OR REPLACE FUNCTION public.sync_delete_entry(p_entry_id uuid, p_book_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing_book_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.book_members
    WHERE book_id = p_book_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Book unavailable';
  END IF;

  SELECT book_id INTO v_existing_book_id
  FROM public.entries
  WHERE id = p_entry_id;

  IF v_existing_book_id IS NULL THEN
    RETURN true; -- retry after a completed delete is idempotent
  END IF;
  IF v_existing_book_id <> p_book_id THEN
    RAISE EXCEPTION 'Entry does not belong to this book';
  END IF;

  DELETE FROM public.entries WHERE id = p_entry_id AND book_id = p_book_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry delete was not applied';
  END IF;
  RETURN true;
END;
$function$;

ALTER FUNCTION public.sync_delete_entry(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_delete_entry(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_delete_entry(uuid, uuid) TO authenticated;
