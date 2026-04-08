-- ============================================================
-- Migration 002: Fix RLS policies that cause book creation to fail
-- ============================================================
-- Root cause: The book_members INSERT policy calls is_book_owner()
-- which itself queries book_members. When the on_book_created trigger
-- fires (SECURITY DEFINER) it tries to insert into book_members, but
-- the RLS policy runs as the user context and finds no owner row yet
-- (circular dependency). Fix: allow the trigger bypass via a simpler policy.

-- Drop the problematic policy
DROP POLICY IF EXISTS "System inserts members (via functions)" ON public.book_members;

-- Replace with a policy that allows:
-- 1. The trigger (SECURITY DEFINER functions bypass RLS in PostgreSQL when
--    search_path is set) - handled by SECURITY DEFINER on trigger function
-- 2. Users inserting themselves as members (accept invite path)
CREATE POLICY "Allow member self-insert"
  ON public.book_members FOR INSERT WITH CHECK (
    auth.uid() = user_id
  );

-- Also ensure the trigger function has proper search_path set
CREATE OR REPLACE FUNCTION public.handle_new_book()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.book_members (book_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;
$$;

-- Fix accept_invitation to also have proper search_path
CREATE OR REPLACE FUNCTION public.accept_invitation(p_invitation_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation public.invitations;
BEGIN
  SELECT * INTO v_invitation
  FROM public.invitations
  WHERE id = p_invitation_id
    AND invitee_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or already processed';
  END IF;

  UPDATE public.invitations
  SET status = 'accepted',
      invitee_id = auth.uid(),
      updated_at = NOW()
  WHERE id = p_invitation_id;

  INSERT INTO public.book_members (book_id, user_id, role)
  VALUES (v_invitation.book_id, auth.uid(), 'member')
  ON CONFLICT (book_id, user_id) DO NOTHING;
END;
$$;

-- Fix reject_invitation search_path too
CREATE OR REPLACE FUNCTION public.reject_invitation(p_invitation_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.invitations
  SET status = 'rejected',
      invitee_id = auth.uid(),
      updated_at = NOW()
  WHERE id = p_invitation_id
    AND invitee_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or already processed';
  END IF;
END;
$$;

-- Fix handle_new_user search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);
  RETURN NEW;
END;
$$;

-- Also add INSERT policy for profiles (needed for Google OAuth new users)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
