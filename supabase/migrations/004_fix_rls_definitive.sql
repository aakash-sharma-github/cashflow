-- ============================================================
-- Migration 004: DEFINITIVE RLS Fix — Book Creation
-- ============================================================
-- The core problem with all previous attempts:
--
-- When INSERT on books fires, the trigger handle_new_book() tries to
-- INSERT into book_members. The book_members INSERT policy checks:
--   EXISTS (SELECT 1 FROM books WHERE books.owner_id = auth.uid())
--
-- But books has its own SELECT RLS policy requiring is_book_member().
-- The user is NOT a member yet (we're in the middle of creating the first
-- membership row). So the books SELECT returns nothing → policy denies insert.
--
-- THE REAL FIX: The trigger function is SECURITY DEFINER (runs as postgres
-- superuser). PostgreSQL superuser bypasses ALL RLS. But this only works
-- if the function is owned by a superuser. In Supabase, postgres IS superuser.
-- The trigger SHOULD work — unless the function was created/replaced by a
-- non-superuser session (e.g., after running migration 002/003 via the
-- Supabase dashboard which uses the anon role for some operations).
--
-- SOLUTION: Set the function owner explicitly to postgres, and also add
-- a direct, simple INSERT policy that doesn't rely on any cross-table queries.

-- ── Step 1: Nuclear cleanup of all book_members INSERT policies ────
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'book_members' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.book_members', pol.policyname);
  END LOOP;
END $$;

-- ── Step 2: Simple, bulletproof INSERT policy ──────────────────────
-- Only ONE condition: the row's user_id must equal the authenticated user.
-- This covers:
--   a) Trigger path: trigger runs as postgres (superuser) → bypasses RLS entirely
--   b) Invite acceptance: user inserts themselves → user_id = auth.uid() ✓
--   c) Direct ownership: user creates their own membership → user_id = auth.uid() ✓
-- No cross-table subqueries = no circular dependency.
CREATE POLICY "book_members_insert" ON public.book_members FOR
INSERT
WITH
    CHECK (auth.uid () = user_id);

-- ── Step 3: Recreate handle_new_book with SECURITY DEFINER ─────────
-- Drop with CASCADE to remove the dependent trigger
DROP FUNCTION IF EXISTS public.handle_new_book() CASCADE;

CREATE FUNCTION public.handle_new_book()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This runs as postgres (superuser) → bypasses ALL RLS
  -- ON CONFLICT is safety net in case of duplicate calls
  INSERT INTO public.book_members (book_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (book_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Reassign ownership to postgres to guarantee superuser execution
ALTER FUNCTION public.handle_new_book() OWNER TO postgres;

-- Recreate trigger
CREATE TRIGGER on_book_created
  AFTER INSERT ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_book();

-- ── Step 4: Recreate handle_new_user ──────────────────────────────
DROP FUNCTION IF EXISTS public.handle_new_user () CASCADE;

CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(COALESCE(NEW.email, 'user@'), '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    full_name  = COALESCE(EXCLUDED.full_name, profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
    updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Step 5: Ensure profiles INSERT policy exists ───────────────────
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile" ON public.profiles FOR
INSERT
WITH
    CHECK (auth.uid () = id);

-- ── Step 6: Recreate helper functions with correct ownership ────────
CREATE OR REPLACE FUNCTION public.is_book_member(p_book_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.book_members
    WHERE book_id = p_book_id AND user_id = auth.uid()
  );
$$;

ALTER FUNCTION public.is_book_member(UUID) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.is_book_owner(p_book_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.book_members
    WHERE book_id = p_book_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;

ALTER FUNCTION public.is_book_owner(UUID) OWNER TO postgres;

-- ── Step 7: Recreate accept/reject invitation functions ────────────
CREATE OR REPLACE FUNCTION public.accept_invitation(p_invitation_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
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
  SET status = 'accepted', invitee_id = auth.uid(), updated_at = NOW()
  WHERE id = p_invitation_id;

  -- This INSERT runs as postgres (SECURITY DEFINER) → bypasses RLS
  INSERT INTO public.book_members (book_id, user_id, role)
  VALUES (v_invitation.book_id, auth.uid(), 'member')
  ON CONFLICT (book_id, user_id) DO NOTHING;
END;
$$;

ALTER FUNCTION public.accept_invitation(UUID) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.reject_invitation(p_invitation_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.invitations
  SET status = 'rejected', invitee_id = auth.uid(), updated_at = NOW()
  WHERE id = p_invitation_id
    AND invitee_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or already processed';
  END IF;
END;
$$;

ALTER FUNCTION public.reject_invitation(UUID) OWNER TO postgres;

-- ── Verify: show current book_members INSERT policies ──────────────
-- After running this you should see exactly ONE policy: "book_members_insert"
SELECT policyname, cmd, qual
FROM pg_policies
WHERE
    tablename = 'book_members'
    AND cmd = 'INSERT';