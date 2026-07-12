-- Expor rest_per_set na view para o ProgramBuilder e outros consumidores.
BEGIN;

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
  we.rest_per_set,
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
  COALESCE(ce.notes, el.instructions_ptbr) AS instructions,
  COALESCE(ce.equipment, el.equipment) AS equipment,
  COALESCE(el.name_en, ce.name_en, ce.name_ptbr) AS name_en
FROM public.workout_exercises we
LEFT JOIN public.exercise_library el ON el.id = we.exercise_id
LEFT JOIN public.coach_exercises ce ON ce.id = we.coach_exercise_id;

COMMIT;
