-- Keep email dispatch idempotent per invitation and cap each inviter at ten sends/hour.
-- Existing invitations remain pending and are eligible for one email dispatch.

CREATE TABLE IF NOT EXISTS public.invitation_email_dispatches (
  invitation_id uuid PRIMARY KEY REFERENCES public.invitations(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invitation_email_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invitation_email_dispatches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.invitation_email_dispatches TO service_role;

CREATE OR REPLACE FUNCTION public.claim_invitation_email_dispatch(
  p_invitation_id uuid,
  p_inviter_id uuid
)
RETURNS TABLE (
  dispatch_status text,
  invitee_email text,
  book_name text,
  inviter_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation public.invitations;
  v_book_name text;
  v_inviter_name text;
  v_email text;
  v_email_confirmed_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     OR p_inviter_id IS NULL
     OR p_invitation_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Serialize rate checks per inviter so concurrent edge invocations cannot
  -- all pass the same hourly limit.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_inviter_id::text, 681245));

  SELECT i.* INTO v_invitation
  FROM public.invitations AS i
  WHERE i.id = p_invitation_id
    AND i.inviter_id = p_inviter_id
    AND i.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or unavailable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invitation_email_dispatches AS d
    WHERE d.invitation_id = p_invitation_id
  ) THEN
    RETURN QUERY SELECT 'already_dispatched'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.invitation_email_dispatches AS d
      WHERE d.inviter_id = p_inviter_id
        AND d.attempted_at >= now() - interval '1 hour') >= 10 THEN
    RETURN QUERY SELECT 'rate_limited'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT lower(trim(u.email)), u.email_confirmed_at
    INTO v_email, v_email_confirmed_at
  FROM auth.users AS u
  WHERE u.id = p_inviter_id;

  IF v_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Invitation sender is not verified';
  END IF;

  IF lower(trim(v_invitation.invitee_email)) = v_email THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  SELECT b.name INTO v_book_name
  FROM public.books AS b WHERE b.id = v_invitation.book_id;
  SELECT COALESCE(NULLIF(trim(p.full_name), ''), split_part(u.email, '@', 1), 'A member')
    INTO v_inviter_name
  FROM auth.users AS u
  LEFT JOIN public.profiles AS p ON p.id = u.id
  WHERE u.id = p_inviter_id;

  IF v_book_name IS NULL THEN
    RAISE EXCEPTION 'Invitation book is unavailable';
  END IF;

  INSERT INTO public.invitation_email_dispatches (invitation_id, inviter_id)
  VALUES (p_invitation_id, p_inviter_id);

  RETURN QUERY SELECT 'claimed'::text, v_invitation.invitee_email, v_book_name, v_inviter_name;
END;
$function$;

ALTER FUNCTION public.claim_invitation_email_dispatch(uuid, uuid)
  SET search_path TO '';

REVOKE ALL ON FUNCTION public.claim_invitation_email_dispatch(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invitation_email_dispatch(uuid, uuid)
  TO service_role;
