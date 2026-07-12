-- Native push tokens for Capacitor builds.
-- Android stores FCM tokens; iOS stores APNs tokens in the legacy fcm_token column.

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  device_id TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT user_push_tokens_user_token_unique UNIQUE (user_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id ON public.user_push_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_last_seen ON public.user_push_tokens (user_id, last_seen_at DESC);

COMMENT ON TABLE public.user_push_tokens IS 'Native push tokens. Android rows use FCM tokens; iOS rows use APNs tokens.';
COMMENT ON COLUMN public.user_push_tokens.fcm_token IS 'Legacy name. Token value is FCM on Android and APNs on iOS.';

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own push tokens" ON public.user_push_tokens;
CREATE POLICY "Users manage own push tokens"
  ON public.user_push_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE public.user_push_tokens TO authenticated;
GRANT ALL ON TABLE public.user_push_tokens TO service_role;
