-- Migration 005: Avatar sync + FCM push token support
-- Run this in Supabase SQL Editor

-- ─── 1. Add push_token column if not already there ───────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- ─── 2. Update handle_new_user to save avatar_url from Google OAuth ──────────
-- Google OAuth provides avatar_url (or 'picture') in raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    )
  )
  ON CONFLICT (id) DO UPDATE
    SET
      email      = EXCLUDED.email,
      full_name  = COALESCE(EXCLUDED.full_name, profiles.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);
  RETURN NEW;
END;
$$;

-- ─── 3. Backfill existing users who signed in with Google ────────────────────
-- This updates any existing profiles that are missing avatar_url
UPDATE public.profiles p
SET
    avatar_url = COALESCE(
        u.raw_user_meta_data ->> 'avatar_url',
        u.raw_user_meta_data ->> 'picture'
    ),
    full_name = COALESCE(
        p.full_name,
        u.raw_user_meta_data ->> 'full_name',
        u.raw_user_meta_data ->> 'name'
    )
FROM auth.users u
WHERE
    p.id = u.id
    AND p.avatar_url IS NULL
    AND (
        u.raw_user_meta_data ->> 'avatar_url' IS NOT NULL
        OR u.raw_user_meta_data ->> 'picture' IS NOT NULL
    );

-- ─── 4. Allow profiles to be updated by push token (for FCM) ─────────────────
-- Policy already exists from migration 001: "Users can update own profile"
-- No change needed — push_token update goes through authService.updateProfile()