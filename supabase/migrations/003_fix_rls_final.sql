-- ============================================================
-- Migration 003: Definitive RLS fix for book creation
-- ============================================================
-- The previous fix (002) still fails because PostgreSQL SECURITY DEFINER
-- functions only bypass RLS when the function owner is a superuser or
-- when the table has RLS disabled for the owner role. In Supabase, the
-- trigger function owner is 'postgres' (superuser), so it SHOULD bypass RLS.
-- However, Supabase's auth schema wrapper can cause the JWT context to bleed.
--
-- The real issue: when a user calls INSERT on books, the on_book_created
-- trigger runs handle_new_book() as SECURITY DEFINER (postgres user).
-- Postgres superuser bypasses RLS entirely — so the book_members insert
-- in the trigger works fine in theory. BUT if the trigger was created
-- before the SECURITY DEFINER clause was added, it runs as the invoker.
--
-- FIX: Recreate the trigger and also add a fallback RLS policy that allows
-- inserting into book_members when the parent book is owned by auth.uid().
-- This covers both trigger path and manual path.

-- Step 1: Recreate trigger function with explicit SECURITY DEFINER
DROP FUNCTION IF EXISTS public.handle_new_book () CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_book()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.book_members (book_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (book_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Step 2: Recreate the trigger (CASCADE above dropped it)
CREATE TRIGGER on_book_created
  AFTER INSERT ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_book();

-- Step 3: Drop ALL existing book_members INSERT policies to start clean
DROP POLICY IF EXISTS "System inserts members (via functions)" ON public.book_members;

DROP POLICY IF EXISTS "Allow member self-insert" ON public.book_members;

DROP POLICY IF EXISTS "book_members_insert" ON public.book_members;

-- Step 4: Add comprehensive INSERT policy
-- Allows inserting a book_member row when:
--   a) The user is inserting themselves (self-join via invite acceptance)
--   b) The book is owned by the current user (covers trigger edge cases on some Supabase plans)
CREATE POLICY "book_members_insert_policy" ON public.book_members FOR
INSERT
WITH
    CHECK (
        auth.uid () = user_id
        OR EXISTS (
            SELECT 1
            FROM public.books
            WHERE
                books.id = book_id
                AND books.owner_id = auth.uid ()
        )
    );

-- Step 5: Also ensure handle_new_user is solid
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(COALESCE(NEW.email, 'user'), '@', 1)
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

-- Recreate trigger for handle_new_user (also dropped by CASCADE above if shared)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 6: profiles INSERT policy (needed for Google OAuth upsert path)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile" ON public.profiles FOR
INSERT
WITH
    CHECK (auth.uid () = id);

-- Step 7: Verify helper functions have correct search_path
CREATE OR REPLACE FUNCTION public.is_book_member(p_book_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.book_members
    WHERE book_id = p_book_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_book_owner(p_book_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.book_members
    WHERE book_id = p_book_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;