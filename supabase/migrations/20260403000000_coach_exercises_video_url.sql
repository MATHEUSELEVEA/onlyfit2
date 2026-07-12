-- Migration to add video_url to coach custom exercises
BEGIN;

ALTER TABLE IF EXISTS public.coach_exercises
  ADD COLUMN IF NOT EXISTS video_url text;

COMMENT ON COLUMN public.coach_exercises.video_url IS 'Video URL for the custom coach exercise uploaded by the coach.';

-- Ensure view_workout_exercises_enriched includes the coach ex video as a fallback if needed
-- Actually, the view can just return ce.video_url if we want, but currently students read we.pro_video_url or el.video_url.
-- To be safe, let's update the view to COALESCE the video_url if we.pro_video_url is null and el.video_url is null.

DROP VIEW IF EXISTS public.view_workout_exercises_enriched CASCADE;

CREATE VIEW public.view_workout_exercises_enriched AS
SELECT
  we.id,
  we.workout_id,
  we.exercise_id,
  we.coach_exercise_id,
  COALESCE(we.exercise_name, ce.name_ptbr, el.name_ptbr, el.name_en) AS exercise_name,
  COALESCE(we.muscle_group, ce.category, el.category) AS muscle_group,
  we.sets,
  we.reps,
  we.reps_per_set,
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
  COALESCE(we.pro_video_url, ce.video_url, el.video_url) AS video_url,
  el.thumb_url,
  COALESCE(ce.notes, el.instructions_ptbr) AS instructions,
  COALESCE(ce.equipment, el.equipment) AS equipment,
  COALESCE(el.name_en, ce.name_en, ce.name_ptbr) AS name_en
FROM public.workout_exercises we
LEFT JOIN public.exercise_library el ON el.id = we.exercise_id
LEFT JOIN public.coach_exercises ce ON ce.id = we.coach_exercise_id;

COMMIT;
