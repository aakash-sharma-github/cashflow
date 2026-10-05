-- Restrict entry mutation to the entry author and book owner. Keep read and
-- create policies unchanged.
DROP POLICY IF EXISTS "Members can update any entry in their books" ON public.entries;
DROP POLICY IF EXISTS "Members can delete any entry in their books" ON public.entries;

CREATE POLICY "Authors and owners can update entries"
  ON public.entries FOR UPDATE
  USING (auth.uid() = user_id OR public.is_book_owner(book_id))
  WITH CHECK (auth.uid() = user_id OR public.is_book_owner(book_id));

CREATE POLICY "Authors and owners can delete entries"
  ON public.entries FOR DELETE
  USING (auth.uid() = user_id OR public.is_book_owner(book_id));

-- Pending invitees may see only the inviter's existing display identity for
-- the invitation context. The relationship is read from the trusted row.
CREATE OR REPLACE FUNCTION public.is_pending_inviter_for_current_user(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invitations AS i
    WHERE i.inviter_id = p_profile_id
      AND i.status = 'pending'
      AND lower(i.invitee_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
REVOKE ALL ON FUNCTION public.is_pending_inviter_for_current_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pending_inviter_for_current_user(uuid) TO authenticated;

DROP POLICY IF EXISTS "Invitees can view inviter identity" ON public.profiles;
CREATE POLICY "Invitees can view inviter identity"
  ON public.profiles FOR SELECT
  USING (public.is_pending_inviter_for_current_user(id));

-- The entry creator is not necessarily the member who performed an update or
-- delete. Capture the authenticated actor for push recipient exclusion.
CREATE OR REPLACE FUNCTION public.notify_push_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payload jsonb;
  v_msg_id bigint;
  v_msg pgmq.message_record;
  v_book_id uuid;
  v_actor_id uuid;
  v_amount numeric;
  v_entry_type text;
  v_note text;
BEGIN
  IF TG_TABLE_NAME = 'entries' THEN
    v_book_id := COALESCE(NEW.book_id, OLD.book_id);
    v_actor_id := COALESCE(auth.uid(), NEW.user_id, OLD.user_id);
    v_amount := COALESCE(NEW.amount, OLD.amount);
    v_entry_type := COALESCE(NEW.type, OLD.type);
    v_note := COALESCE(NEW.note, OLD.note);
    v_payload := jsonb_build_object(
      'type', CASE TG_OP WHEN 'INSERT' THEN 'entry_added' WHEN 'UPDATE' THEN 'entry_updated' ELSE 'entry_deleted' END,
      'book_id', v_book_id,
      'actor_id', v_actor_id,
      'amount', public.format_inr(v_amount),
      'entry_type', v_entry_type,
      'note', v_note
    );
  ELSIF TG_TABLE_NAME = 'invitations' AND TG_OP = 'INSERT' THEN
    v_payload := jsonb_build_object('type','invitation_sent','book_id',NEW.book_id,'actor_id',NEW.inviter_id,'invitee_email',NEW.invitee_email);
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT pgmq.send('push_notifications', v_payload) INTO v_msg_id;
  SELECT * INTO v_msg FROM pgmq.read('push_notifications', 0, 1) WHERE msg_id = v_msg_id LIMIT 1;
  IF v_msg IS NOT NULL THEN
    PERFORM public.process_push_message(v_msg.message);
    PERFORM pgmq.delete('push_notifications', v_msg_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.notify_push_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_push_trigger() TO postgres;

-- Owner-only transactional bulk delete; used by online UI and offline replay.
CREATE OR REPLACE FUNCTION public.delete_book_entries(p_book_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_book_owner(p_book_id) THEN
    RAISE EXCEPTION 'Only the book owner can delete all entries' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.entries WHERE book_id = p_book_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_book_entries(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_book_entries(uuid) TO authenticated;
