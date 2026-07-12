-- Coach exercise library: personals can create reusable exercises visible only to them.
-- workout_exercises can reference coach_exercises via coach_exercise_id; name is denormalized in exercise_name for display (e.g. for students who cannot read coach_exercises by RLS).

BEGIN;

-- 1. Table coach_exercises (creator_id = coach, RLS so only owner sees)
CREATE TABLE IF NOT EXISTS public.coach_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name_ptbr text NOT NULL,
  name_en text,
  primary_muscles text[] DEFAULT '{}',
  category text,
  equipment text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_exercises_creator ON public.coach_exercises(creator_id);

ALTER TABLE public.coach_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches see own coach_exercises"
  ON public.coach_exercises FOR SELECT
  USING (auth.uid() = creator_id);

CREATE POLICY "Coaches insert own coach_exercises"
  ON public.coach_exercises FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Coaches update own coach_exercises"
  ON public.coach_exercises FOR UPDATE
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Coaches delete own coach_exercises"
  ON public.coach_exercises FOR DELETE
  USING (auth.uid() = creator_id);

-- 2. workout_exercises: optional FK to coach_exercises (when set, exercise_name should be set for display where RLS hides coach_exercises)
ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS coach_exercise_id uuid REFERENCES public.coach_exercises(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workout_exercises_coach_exercise ON public.workout_exercises(coach_exercise_id);

COMMENT ON COLUMN public.workout_exercises.coach_exercise_id IS 'When set, this row uses the coach’s custom exercise; exercise_name should be set for display. Only creator can see coach_exercises (RLS).';

-- 3. view_workout_exercises_enriched: include coach exercise name when visible (for coach viewing); others already have exercise_name
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
  el.video_url,
  el.thumb_url,
  COALESCE(ce.notes, el.instructions_ptbr) AS instructions,
  COALESCE(ce.equipment, el.equipment) AS equipment,
  COALESCE(el.name_en, ce.name_en, ce.name_ptbr) AS name_en
FROM public.workout_exercises we
LEFT JOIN public.exercise_library el ON el.id = we.exercise_id
LEFT JOIN public.coach_exercises ce ON ce.id = we.coach_exercise_id;

COMMIT;
