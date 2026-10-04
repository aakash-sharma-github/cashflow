-- Idempotent book creation for offline queue replay. The caller supplies a
-- stable UUID persisted with the queue operation, so a retry after a lost
-- response cannot create a second book. Existing rows are untouched.
CREATE OR REPLACE FUNCTION public.sync_create_book(
  p_book_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_color text DEFAULT '#6366F1',
  p_currency text DEFAULT 'USD'
)
RETURNS public.books
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_book public.books;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_book_id IS NULL OR p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Invalid book';
  END IF;

  INSERT INTO public.books (id, name, description, color, currency, owner_id)
  VALUES (p_book_id, trim(p_name), p_description, p_color, p_currency, v_user_id)
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        color = EXCLUDED.color,
        currency = EXCLUDED.currency,
        updated_at = now()
    WHERE public.books.owner_id = v_user_id
  RETURNING * INTO v_book;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Book unavailable';
  END IF;

  INSERT INTO public.book_members (book_id, user_id, role)
  VALUES (v_book.id, v_user_id, 'owner')
  ON CONFLICT (book_id, user_id) DO NOTHING;

  RETURN v_book;
END;
$function$;

ALTER FUNCTION public.sync_create_book(uuid, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_create_book(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_create_book(uuid, text, text, text, text) TO authenticated;

-- A retry after an ambiguous network failure may find the book already gone.
-- Treat that as success, while still rejecting attempts against another
-- owner's book (which the RLS-backed direct delete would silently hide).
CREATE OR REPLACE FUNCTION public.sync_delete_book(p_book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT owner_id INTO v_owner_id FROM public.books WHERE id = p_book_id;
  IF v_owner_id IS NULL THEN
    RETURN;
  END IF;
  IF v_owner_id <> v_user_id THEN
    RAISE EXCEPTION 'Book unavailable';
  END IF;
  DELETE FROM public.books WHERE id = p_book_id AND owner_id = v_user_id;
END;
$function$;

ALTER FUNCTION public.sync_delete_book(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_delete_book(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_delete_book(uuid) TO authenticated;
