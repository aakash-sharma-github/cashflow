-- Add FCM token to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Add avatar URL to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;