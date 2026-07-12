-- Push notification preferences (Apple Guideline 4.5.4: marketing opt-in + in-app opt-out).
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_functional_enabled boolean NOT NULL DEFAULT true,
  push_marketing_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_notification_preferences IS
  'Per-user native push preferences. Marketing requires explicit opt-in (default false).';
COMMENT ON COLUMN public.user_notification_preferences.push_functional_enabled IS
  'Transactional/functional pushes (workout reminders, coach messages, etc.).';
COMMENT ON COLUMN public.user_notification_preferences.push_marketing_enabled IS
  'Promotional pushes; must be explicitly opted in per Apple 4.5.4.';

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users manage own notification preferences"
  ON public.user_notification_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE public.user_notification_preferences TO authenticated;
GRANT ALL ON TABLE public.user_notification_preferences TO service_role;

-- Ensure row exists when user registers push token (default: functional on, marketing off).
CREATE OR REPLACE FUNCTION public.ensure_user_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_notification_preferences (user_id)
  VALUES (NEW.user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_user_notification_preferences ON public.user_push_tokens;
CREATE TRIGGER trg_ensure_user_notification_preferences
  AFTER INSERT ON public.user_push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_user_notification_preferences();
