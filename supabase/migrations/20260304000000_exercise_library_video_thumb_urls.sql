-- exercise_library: add video_url and thumb_url for R2 mirror (public URLs)
-- view_workout_exercises_enriched: expose video_url and thumb_url

BEGIN;

ALTER TABLE public.exercise_library
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS thumb_url text;

COMMENT ON COLUMN public.exercise_library.video_url IS 'Public URL of video (e.g. Cloudflare R2) when mirrored from MuscleWiki';
COMMENT ON COLUMN public.exercise_library.thumb_url IS 'Public URL of thumbnail image when mirrored';

DROP VIEW IF EXISTS public.view_workout_exercises_enriched CASCADE;

CREATE VIEW public.view_workout_exercises_enriched AS
SELECT
  we.id,
  we.workout_id,
  we.exercise_id,
  COALESCE(we.exercise_name, el.name_ptbr, el.name_en) AS exercise_name,
  COALESCE(we.muscle_group, el.category) AS muscle_group,
  we.sets,
  we.reps,
  we.rest_seconds,
  we.cadence,
  we.notes,
  we.tempo_notes,
  we.position,
  we.super_set_id,
  we.load_meta_goal,
  we.pro_video_url,
  el.video_asset_id,
  el.thumb_asset_id,
  el.video_url,
  el.thumb_url,
  el.instructions_ptbr AS instructions,
  el.equipment,
  el.name_en
FROM public.workout_exercises we
LEFT JOIN public.exercise_library el ON el.id = we.exercise_id;

COMMIT;
