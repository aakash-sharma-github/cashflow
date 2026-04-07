-- ============================================================
-- CashFlow — Supabase SQL Schema + RLS Policies
-- Run this in Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────
-- 1. PROFILES (extends auth.users)
-- ─────────────────────────────────────────
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  push_token  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────
-- 2. BOOKS
-- ─────────────────────────────────────────
CREATE TABLE public.books (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT DEFAULT '#6366F1',
  currency    TEXT DEFAULT 'USD',
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_books_owner_id ON public.books(owner_id);

-- ─────────────────────────────────────────
-- 3. BOOK MEMBERS
-- ─────────────────────────────────────────
CREATE TYPE public.member_role AS ENUM ('owner', 'member');

CREATE TABLE public.book_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id   UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      public.member_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(book_id, user_id)
);

CREATE INDEX idx_book_members_book_id ON public.book_members(book_id);
CREATE INDEX idx_book_members_user_id ON public.book_members(user_id);

-- Auto-add owner as member when book is created
CREATE OR REPLACE FUNCTION public.handle_new_book()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.book_members (book_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_book_created
  AFTER INSERT ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_book();

-- ─────────────────────────────────────────
-- 4. ENTRIES
-- ─────────────────────────────────────────
CREATE TYPE public.entry_type AS ENUM ('cash_in', 'cash_out');

CREATE TABLE public.entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id    UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount     NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  type       public.entry_type NOT NULL,
  note       TEXT,
  entry_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entries_book_id ON public.entries(book_id);
CREATE INDEX idx_entries_book_id_date ON public.entries(book_id, entry_date DESC);
CREATE INDEX idx_entries_user_id ON public.entries(user_id);

-- ─────────────────────────────────────────
-- 5. INVITATIONS
-- ─────────────────────────────────────────
CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'rejected');

CREATE TABLE public.invitations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id        UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  inviter_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_email  TEXT NOT NULL,
  invitee_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status         public.invitation_status NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(book_id, invitee_email)
);

CREATE INDEX idx_invitations_book_id ON public.invitations(book_id);
CREATE INDEX idx_invitations_invitee_email ON public.invitations(invitee_email);
CREATE INDEX idx_invitations_invitee_id ON public.invitations(invitee_id);
CREATE INDEX idx_invitations_status ON public.invitations(status);

-- ─────────────────────────────────────────
-- 6. HELPER FUNCTION: is_book_member
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_book_member(p_book_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.book_members
    WHERE book_id = p_book_id
    AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_book_owner(p_book_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.book_members
    WHERE book_id = p_book_id
    AND user_id = auth.uid()
    AND role = 'owner'
  );
$$;

-- ─────────────────────────────────────────
-- 7. ACCEPT INVITATION FUNCTION
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_invitation(p_invitation_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  -- Update invitation
  UPDATE public.invitations
  SET status = 'accepted',
      invitee_id = auth.uid(),
      updated_at = NOW()
  WHERE id = p_invitation_id;

  -- Add to book members (ignore if already exists)
  INSERT INTO public.book_members (book_id, user_id, role)
  VALUES (v_invitation.book_id, auth.uid(), 'member')
  ON CONFLICT (book_id, user_id) DO NOTHING;
END;
$$;

-- Reject invitation
CREATE OR REPLACE FUNCTION public.reject_invitation(p_invitation_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- ─────────────────────────────────────────
-- 8. UPDATED_AT TRIGGERS
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_books_updated_at BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_entries_updated_at BEFORE UPDATE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_invitations_updated_at BEFORE UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Members can view co-member profiles"
  ON public.profiles FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.book_members bm1
      JOIN public.book_members bm2 ON bm1.book_id = bm2.book_id
      WHERE bm1.user_id = auth.uid()
      AND bm2.user_id = profiles.id
    )
  );

-- BOOKS
CREATE POLICY "Members can view their books"
  ON public.books FOR SELECT USING (public.is_book_member(id));

CREATE POLICY "Authenticated users can create books"
  ON public.books FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their books"
  ON public.books FOR UPDATE USING (public.is_book_owner(id));

CREATE POLICY "Owners can delete their books"
  ON public.books FOR DELETE USING (public.is_book_owner(id));

-- BOOK MEMBERS
CREATE POLICY "Members can view book members"
  ON public.book_members FOR SELECT USING (public.is_book_member(book_id));

CREATE POLICY "System inserts members (via functions)"
  ON public.book_members FOR INSERT WITH CHECK (
    public.is_book_owner(book_id) OR auth.uid() = user_id
  );

CREATE POLICY "Owners can remove members"
  ON public.book_members FOR DELETE USING (
    public.is_book_owner(book_id) AND role != 'owner'
  );

-- ENTRIES
CREATE POLICY "Members can view entries"
  ON public.entries FOR SELECT USING (public.is_book_member(book_id));

CREATE POLICY "Members can create entries"
  ON public.entries FOR INSERT WITH CHECK (
    public.is_book_member(book_id) AND auth.uid() = user_id
  );

CREATE POLICY "Members can update any entry in their books"
  ON public.entries FOR UPDATE USING (public.is_book_member(book_id));

CREATE POLICY "Members can delete any entry in their books"
  ON public.entries FOR DELETE USING (public.is_book_member(book_id));

-- INVITATIONS
CREATE POLICY "Inviter and invitee can view invitations"
  ON public.invitations FOR SELECT USING (
    auth.uid() = inviter_id
    OR invitee_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Book members can send invitations"
  ON public.invitations FOR INSERT WITH CHECK (
    public.is_book_member(book_id) AND auth.uid() = inviter_id
  );

CREATE POLICY "Invitee can update (accept/reject) their invitations"
  ON public.invitations FOR UPDATE USING (
    invitee_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Inviter can delete pending invitations"
  ON public.invitations FOR DELETE USING (
    auth.uid() = inviter_id AND status = 'pending'
  );

-- ─────────────────────────────────────────
-- 9. REALTIME — Enable for live tables
-- ─────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.book_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invitations;
