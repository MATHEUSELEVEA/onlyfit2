-- musclewiki_sync_status: state per source_id for CI/cron and retomada (P1 Antigravity)
-- exercise_library: optional media_status, media_last_error, media_updated_at for ops/dashboards

BEGIN;

CREATE TABLE IF NOT EXISTS public.musclewiki_sync_status (
  source_id text PRIMARY KEY,
  detail_fetched boolean NOT NULL DEFAULT false,
  translated boolean NOT NULL DEFAULT false,
  thumb_mirrored boolean NOT NULL DEFAULT false,
  videos_mirrored_count integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.musclewiki_sync_status IS 'Sync state per MuscleWiki source_id for idempotent mirror and retomada (Antigravity P1)';

ALTER TABLE public.exercise_library
  ADD COLUMN IF NOT EXISTS media_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS media_last_error text,
  ADD COLUMN IF NOT EXISTS media_updated_at timestamptz;

COMMENT ON COLUMN public.exercise_library.media_status IS 'pending | thumb_ok | video_ok | failed (Antigravity P1)';
COMMENT ON COLUMN public.exercise_library.media_last_error IS 'Last mirror error (e.g. 429, timeout)';
COMMENT ON COLUMN public.exercise_library.media_updated_at IS 'Last media mirror update';

COMMIT;
