-- Phase 1: close client-side authorization gaps without changing existing rows.
-- Membership creation is performed by create_book / accept_invitation SECURITY DEFINER RPCs.
-- Push-token writes use save_push_token; signup profile creation uses the auth trigger.

DROP POLICY IF EXISTS book_members_insert ON public.book_members;
DROP POLICY IF EXISTS invitations_update ON public.invitations;
DROP POLICY IF EXISTS profiles_insert ON public.profiles;

REVOKE INSERT ON TABLE public.book_members FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON TABLE public.invitations FROM PUBLIC, anon, authenticated;

-- Profile email and identity fields must not be editable through the client API.
REVOKE INSERT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, email, push_token, created_at, updated_at)
  ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (full_name, avatar_url) ON TABLE public.profiles TO authenticated;

-- Resolve invitees against Supabase Auth, not the client-editable profile email.
-- FOR UPDATE serializes simultaneous accept/reject attempts for the same invite.
CREATE OR REPLACE FUNCTION public.accept_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_confirmed_at timestamptz;
  v_invitation public.invitations;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT lower(trim(u.email)), u.email_confirmed_at
    INTO v_email, v_email_confirmed_at
  FROM auth.users AS u
  WHERE u.id = v_user_id;

  IF NOT FOUND OR v_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Invitation not found or unavailable';
  END IF;

  SELECT i.* INTO v_invitation
  FROM public.invitations AS i
  WHERE i.id = p_invitation_id
    AND lower(trim(i.invitee_email)) = v_email
    AND i.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or unavailable';
  END IF;

  UPDATE public.invitations
  SET status = 'accepted', invitee_id = v_user_id, updated_at = now()
  WHERE id = v_invitation.id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or unavailable';
  END IF;

  INSERT INTO public.book_members (book_id, user_id, role)
  VALUES (v_invitation.book_id, v_user_id, 'member')
  ON CONFLICT (book_id, user_id) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_confirmed_at timestamptz;
  v_invitation_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT lower(trim(u.email)), u.email_confirmed_at
    INTO v_email, v_email_confirmed_at
  FROM auth.users AS u
  WHERE u.id = v_user_id;

  IF NOT FOUND OR v_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Invitation not found or unavailable';
  END IF;

  SELECT i.id INTO v_invitation_id
  FROM public.invitations AS i
  WHERE i.id = p_invitation_id
    AND lower(trim(i.invitee_email)) = v_email
    AND i.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or unavailable';
  END IF;

  UPDATE public.invitations
  SET status = 'rejected', invitee_id = v_user_id, updated_at = now()
  WHERE id = v_invitation_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or unavailable';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_invitation(uuid) TO authenticated;
