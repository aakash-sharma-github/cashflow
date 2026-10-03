CREATE INDEX IF NOT EXISTS invitation_email_dispatches_inviter_attempted_at_idx
  ON public.invitation_email_dispatches (inviter_id, attempted_at DESC);
