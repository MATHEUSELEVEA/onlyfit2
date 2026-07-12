-- =============================================================================
-- Phase 1 + 1.5 — MuscleWiki ALL STAR (zero YMove)
-- - Nova exercise_library (source/source_id, FTS+trigram, trigger updated_at)
-- - workout_exercises.exercise_id (uuid FK), drop ymove_exercise_id
-- - view_workout_exercises_enriched (join por FK), view_workout_exercises_missing
-- - rpc_search_exercises (min 2 chars, prefix boost)
-- - add_exercise_to_avulsos(p_exercise_id uuid)
-- - Todas as RPCs que inserem em workout_exercises passam a usar exercise_id
-- =============================================================================

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ========== 1) Drop views that depend on exercise_library ==========
DROP VIEW IF EXISTS public.view_workout_exercises_enriched CASCADE;

-- ========== 2) Backup old table, create new exercise_library (idempotent: skip if backup already exists) ==========
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'exercise_library_ymove_backup') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'exercise_library') THEN
      ALTER TABLE public.exercise_library RENAME TO exercise_library_ymove_backup;
    END IF;
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.exercise_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'musclewiki',
  source_id text NOT NULL,
  name_en text NOT NULL,
  name_ptbr text NOT NULL,
  instructions_en text,
  instructions_ptbr text,
  category text,
  equipment text,
  primary_muscles text[],
  secondary_muscles text[],
  video_asset_id text,
  thumb_asset_id text,
  translation_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

-- FTS columns (unaccent for PT-BR/EN) — only if not already present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exercise_library' AND column_name = 'search_pt') THEN
    ALTER TABLE public.exercise_library ADD COLUMN IF NOT EXISTS search_pt tsvector
      GENERATED ALWAYS AS (to_tsvector('portuguese', unaccent(coalesce(name_ptbr,'') || ' ' || coalesce(category,'') || ' ' || coalesce(equipment,'')))) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exercise_library' AND column_name = 'search_en') THEN
    ALTER TABLE public.exercise_library ADD COLUMN IF NOT EXISTS search_en tsvector
      GENERATED ALWAYS AS (to_tsvector('english', unaccent(coalesce(name_en,'') || ' ' || coalesce(category,'') || ' ' || coalesce(equipment,'')))) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS exercise_library_search_pt_gin ON public.exercise_library USING gin (search_pt);
CREATE INDEX IF NOT EXISTS exercise_library_search_en_gin ON public.exercise_library USING gin (search_en);
CREATE INDEX IF NOT EXISTS exercise_library_name_ptbr_trgm ON public.exercise_library USING gin (name_ptbr gin_trgm_ops);
CREATE INDEX IF NOT EXISTS exercise_library_name_en_trgm ON public.exercise_library USING gin (name_en gin_trgm_ops);
CREATE INDEX IF NOT EXISTS exercise_library_category_idx ON public.exercise_library (category);
CREATE INDEX IF NOT EXISTS exercise_library_equipment_idx ON public.exercise_library (equipment);
CREATE INDEX IF NOT EXISTS exercise_library_primary_muscles_gin ON public.exercise_library USING gin (primary_muscles);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS set_exercise_library_updated_at ON public.exercise_library;
CREATE TRIGGER set_exercise_library_updated_at
  BEFORE UPDATE ON public.exercise_library
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exercise_library_select_all" ON public.exercise_library;
DROP POLICY IF EXISTS "exercise_library_select_coach_admin" ON public.exercise_library;
CREATE POLICY "exercise_library_select_coach_admin"
  ON public.exercise_library FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.coach_relationships cr WHERE cr.coach_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.workouts w WHERE w.pro_id = auth.uid() LIMIT 1)
  );
DROP POLICY IF EXISTS "exercise_library_insert_service_only" ON public.exercise_library;
CREATE POLICY "exercise_library_insert_service_only"
  ON public.exercise_library FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS "exercise_library_update_service_only" ON public.exercise_library;
CREATE POLICY "exercise_library_update_service_only"
  ON public.exercise_library FOR UPDATE TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "exercise_library_delete_service_only" ON public.exercise_library;
CREATE POLICY "exercise_library_delete_service_only"
  ON public.exercise_library FOR DELETE TO service_role USING (true);

-- ========== 3) workout_exercises: add exercise_id, drop ymove_exercise_id ==========
ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS exercise_id uuid REFERENCES public.exercise_library(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS workout_exercises_exercise_id_idx ON public.workout_exercises (exercise_id);
ALTER TABLE public.workout_exercises DROP COLUMN IF EXISTS ymove_exercise_id;

-- ========== 4) workout_logs: drop ymove_exercise_id ==========
ALTER TABLE public.workout_logs DROP COLUMN IF EXISTS ymove_exercise_id;

-- ========== 5) view_workout_exercises_enriched (join por FK) ==========
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
  el.instructions_ptbr AS instructions,
  el.equipment,
  el.name_en
FROM public.workout_exercises we
LEFT JOIN public.exercise_library el ON el.id = we.exercise_id;

-- ========== 6) view_workout_exercises_missing (diagnóstico) ==========
CREATE OR REPLACE VIEW public.view_workout_exercises_missing AS
SELECT we.id, we.workout_id, we.exercise_id, we.exercise_name, we.position
FROM public.workout_exercises we
WHERE we.exercise_id IS NULL;

-- ========== 7) rpc_search_exercises (min 2 chars, FTS + prefix boost, limit 20) ==========
DROP FUNCTION IF EXISTS public.rpc_search_exercises(text, text, text, text, text, integer, uuid);
CREATE OR REPLACE FUNCTION public.rpc_search_exercises(
  q text,
  locale text DEFAULT 'ptbr',
  p_category text DEFAULT null,
  p_equipment text DEFAULT null,
  p_muscle text DEFAULT null,
  lim integer DEFAULT 20,
  cur_id uuid DEFAULT null
)
RETURNS TABLE (
  id uuid,
  name text,
  category text,
  equipment text,
  primary_muscles text[],
  thumb_asset_id text,
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      el.id,
      CASE WHEN lower(locale) IN ('pt','ptbr','pt-br') THEN el.name_ptbr ELSE el.name_en END AS name,
      el.category,
      el.equipment,
      el.primary_muscles,
      el.thumb_asset_id,
      CASE WHEN lower(locale) IN ('pt','ptbr','pt-br')
        THEN ts_rank_cd(el.search_pt, websearch_to_tsquery('portuguese', coalesce(trim(q), '')))
        ELSE ts_rank_cd(el.search_en, websearch_to_tsquery('english', coalesce(trim(q), '')))
      END AS fts_rank,
      CASE WHEN lower(locale) IN ('pt','ptbr','pt-br')
        THEN (el.name_ptbr ILIKE coalesce(trim(q), '') || '%')::int
        ELSE (el.name_en ILIKE coalesce(trim(q), '') || '%')::int
      END AS prefix_match
    FROM public.exercise_library el
    WHERE
      (p_category IS NULL OR el.category = p_category)
      AND (p_equipment IS NULL OR el.equipment = p_equipment)
      AND (p_muscle IS NULL OR el.primary_muscles @> ARRAY[p_muscle])
      AND (cur_id IS NULL OR el.id > cur_id)
  ),
  ranked AS (
    SELECT
      b.*,
      (COALESCE(b.fts_rank, 0) + b.prefix_match::real * 0.5) AS rank
    FROM base b
    WHERE
      (q IS NULL OR length(trim(q)) < 2)
      OR (length(trim(q)) >= 2 AND (b.fts_rank > 0 OR b.prefix_match = 1))
      OR (length(trim(q)) >= 2 AND similarity(unaccent(b.name), unaccent(coalesce(q,''))) > 0.25)
  )
  SELECT r.id, r.name, r.category, r.equipment, r.primary_muscles, r.thumb_asset_id, r.rank
  FROM ranked r
  ORDER BY r.rank DESC NULLS LAST, r.id ASC
  LIMIT greatest(1, least(lim, 20));
$$;

REVOKE ALL ON FUNCTION public.rpc_search_exercises(text, text, text, text, text, integer, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_search_exercises(text, text, text, text, text, integer, uuid) TO authenticated;

-- ========== 8) add_exercise_to_avulsos(p_exercise_id uuid) ==========
DROP FUNCTION IF EXISTS public.add_exercise_to_avulsos(uuid, uuid, text, int, int, uuid, text, uuid, int, text, text);
CREATE OR REPLACE FUNCTION public.add_exercise_to_avulsos(
  p_student_id uuid,
  p_cycle_id uuid,
  p_day_code text,
  p_target_order_index int,
  p_items_per_week int,
  p_exercise_id uuid,
  p_exercise_name text,
  p_coach_id uuid,
  p_sets int DEFAULT 3,
  p_reps text DEFAULT '12',
  p_pro_video_url text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avulsos_workout_id uuid;
  v_avulsos_assignment_id uuid;
  v_max_pos int;
  v_coach_ok boolean;
  v_new_exercise_id uuid;
  v_order_index int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_coach_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM coach_relationships
    WHERE student_id = p_student_id AND coach_id = p_coach_id AND status = 'active'
  ) INTO v_coach_ok;
  IF NOT coalesce(v_coach_ok, false) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT w.id, a.id INTO v_avulsos_workout_id, v_avulsos_assignment_id
  FROM student_workout_assignments a
  JOIN workouts w ON w.id = a.workout_id
  WHERE a.student_user_id = p_student_id
    AND a.cycle_id = p_cycle_id
    AND a.status = 'active'
    AND w.title = 'Exercícios avulsos'
    AND (a.days_of_week = array[p_day_code] OR a.days_of_week @> array[p_day_code])
    AND coalesce(a.order_index, -1) >= p_target_order_index
    AND coalesce(a.order_index, -1) < p_target_order_index + p_items_per_week
  LIMIT 1;

  IF v_avulsos_workout_id IS NULL THEN
    INSERT INTO workouts (
      title, description, owner_id, pro_id, tenant_id, workout_type, source_id
    ) VALUES (
      'Exercícios avulsos', null, p_coach_id, p_coach_id, p_student_id, 'coach_individual', p_student_id
    )
    RETURNING id INTO v_avulsos_workout_id;

    SELECT coalesce(max(order_index), p_target_order_index - 1) + 1 INTO v_order_index
    FROM student_workout_assignments
    WHERE student_user_id = p_student_id AND cycle_id = p_cycle_id
      AND order_index >= p_target_order_index
      AND order_index < p_target_order_index + p_items_per_week;

    INSERT INTO student_workout_assignments (
      student_user_id, workout_id, cycle_id, source_type, source_id, status, days_of_week, order_index
    )
    VALUES (p_student_id, v_avulsos_workout_id, p_cycle_id, 'coach', p_coach_id, 'active', array[p_day_code], v_order_index)
    RETURNING id INTO v_avulsos_assignment_id;
  END IF;

  SELECT coalesce(max(position), 0) + 1 INTO v_max_pos
  FROM workout_exercises WHERE workout_id = v_avulsos_workout_id;

  INSERT INTO workout_exercises (
    workout_id, exercise_id, exercise_name, sets, reps, position, pro_video_url
  )
  VALUES (
    v_avulsos_workout_id,
    p_exercise_id,
    coalesce(nullif(trim(p_exercise_name), ''), 'Exercício'),
    coalesce(p_sets, 3),
    coalesce(nullif(trim(p_reps), ''), '12'),
    v_max_pos,
    p_pro_video_url
  )
  RETURNING id INTO v_new_exercise_id;

  RETURN v_new_exercise_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_exercise_to_avulsos(uuid, uuid, text, int, int, uuid, text, uuid, int, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.add_exercise_to_avulsos(uuid, uuid, text, int, int, uuid, text, uuid, int, text, text) TO authenticated;

-- ========== Phase 1.5: RPCs que inserem em workout_exercises (exercise_id) ==========

-- clone_protocol_for_student (3 params)
CREATE OR REPLACE FUNCTION clone_protocol_for_student(
  p_protocol_id UUID,
  p_student_id UUID,
  p_coach_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_protocol RECORD;
  v_new_cycle_id UUID;
  v_item RECORD;
  v_new_workout_id UUID;
  v_exercise RECORD;
  v_day_code TEXT;
BEGIN
  SELECT * INTO v_protocol FROM public.workout_protocols WHERE id = p_protocol_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Protocol % not found', p_protocol_id; END IF;

  UPDATE public.workout_cycles SET status = 'archived', ends_at = CURRENT_DATE
  WHERE student_id = p_student_id AND coach_id = p_coach_id AND status = 'active';
  UPDATE public.student_workout_assignments SET status = 'archived'
  WHERE student_user_id = p_student_id AND source_id = p_coach_id AND status = 'active';

  INSERT INTO public.workout_cycles (coach_id, student_id, name, description, source_protocol_id, status, starts_at, duration_weeks)
  VALUES (p_coach_id, p_student_id, v_protocol.name, v_protocol.description, p_protocol_id, 'active', CURRENT_DATE, COALESCE(v_protocol.auto_archive_after_weeks, 4))
  RETURNING id INTO v_new_cycle_id;

  FOR v_item IN
    SELECT w.*, pi.day_label, pi.day_code, pi.position AS item_position
    FROM public.workout_protocol_items pi
    JOIN public.workouts w ON pi.workout_template_id = w.id
    WHERE pi.protocol_id = p_protocol_id
    ORDER BY pi.position
  LOOP
    v_day_code := COALESCE(v_item.day_code, label_to_day_code(v_item.day_label));
    INSERT INTO public.workouts (title, description, owner_id, pro_id, tenant_id, workout_type, source_template_id, is_published, category, level, tags, coach_video_url)
    VALUES (v_item.title, v_item.description, p_student_id, p_coach_id, v_item.tenant_id, 'coach_individual', v_item.id, false, v_item.category, v_item.level, v_item.tags, v_item.coach_video_url)
    RETURNING id INTO v_new_workout_id;

    INSERT INTO public.student_workout_assignments (student_user_id, workout_id, cycle_id, source_type, source_id, status, days_of_week, protocol_starts_at, starts_at, order_index)
    VALUES (p_student_id, v_new_workout_id, v_new_cycle_id, 'coach', p_coach_id, 'active', CASE WHEN v_day_code IS NOT NULL THEN ARRAY[v_day_code] ELSE '{}'::TEXT[] END, CURRENT_DATE, CURRENT_DATE, v_item.item_position);

    FOR v_exercise IN SELECT * FROM public.workout_exercises WHERE workout_id = v_item.id ORDER BY position
    LOOP
      INSERT INTO public.workout_exercises (workout_id, sets, reps, rest_seconds, cadence, notes, tempo_notes, position, exercise_id, super_set_id, load_meta_goal, rest_type, pro_video_url)
      VALUES (v_new_workout_id, v_exercise.sets, v_exercise.reps, v_exercise.rest_seconds, v_exercise.cadence, v_exercise.notes, v_exercise.tempo_notes, v_exercise.position, v_exercise.exercise_id, v_exercise.super_set_id, v_exercise.load_meta_goal, v_exercise.rest_type, v_exercise.pro_video_url);
    END LOOP;
  END LOOP;
  RETURN v_new_cycle_id;
END;
$$;

-- clone_protocol_for_student (5 params)
CREATE OR REPLACE FUNCTION clone_protocol_for_student(
  p_protocol_id UUID,
  p_student_id UUID,
  p_coach_id UUID,
  p_starts_at DATE DEFAULT NULL,
  p_ends_at DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_protocol RECORD;
  v_new_cycle_id UUID;
  v_item RECORD;
  v_new_workout_id UUID;
  v_exercise RECORD;
  v_day_code TEXT;
  v_effective_start DATE;
  v_effective_end DATE;
  v_duration_weeks INT;
BEGIN
  SELECT * INTO v_protocol FROM public.workout_protocols WHERE id = p_protocol_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Protocol % not found', p_protocol_id; END IF;
  v_effective_start := COALESCE(p_starts_at, v_protocol.starts_at, CURRENT_DATE);
  v_duration_weeks := COALESCE(v_protocol.duration_weeks, v_protocol.auto_archive_after_weeks, 4);
  v_effective_end := COALESCE(p_ends_at, v_protocol.ends_at, v_effective_start + (v_duration_weeks * 7));

  UPDATE public.workout_cycles SET status = 'archived', ends_at = CURRENT_DATE
  WHERE student_id = p_student_id AND coach_id = p_coach_id AND status = 'active';
  UPDATE public.student_workout_assignments SET status = 'archived'
  WHERE student_user_id = p_student_id AND source_id = p_coach_id AND status = 'active';

  INSERT INTO public.workout_cycles (coach_id, student_id, name, description, source_protocol_id, status, starts_at, ends_at, duration_weeks)
  VALUES (p_coach_id, p_student_id, v_protocol.name, v_protocol.description, p_protocol_id, 'active', v_effective_start, v_effective_end, v_duration_weeks)
  RETURNING id INTO v_new_cycle_id;

  FOR v_item IN
    SELECT w.*, pi.day_label, pi.day_code, pi.position AS item_position
    FROM public.workout_protocol_items pi
    JOIN public.workouts w ON pi.workout_template_id = w.id
    WHERE pi.protocol_id = p_protocol_id
    ORDER BY pi.position
  LOOP
    v_day_code := COALESCE(v_item.day_code, label_to_day_code(v_item.day_label));
    INSERT INTO public.workouts (title, description, owner_id, pro_id, tenant_id, workout_type, source_template_id, is_published, category, level, tags, coach_video_url)
    VALUES (v_item.title, v_item.description, p_student_id, p_coach_id, v_item.tenant_id, 'coach_individual', v_item.id, false, v_item.category, v_item.level, v_item.tags, v_item.coach_video_url)
    RETURNING id INTO v_new_workout_id;

    INSERT INTO public.student_workout_assignments (student_user_id, workout_id, cycle_id, source_type, source_id, status, days_of_week, protocol_starts_at, starts_at, order_index)
    VALUES (p_student_id, v_new_workout_id, v_new_cycle_id, 'coach', p_coach_id, 'active', CASE WHEN v_day_code IS NOT NULL THEN ARRAY[v_day_code] ELSE '{}'::TEXT[] END, v_effective_start, v_effective_start, v_item.item_position);

    FOR v_exercise IN SELECT * FROM public.workout_exercises WHERE workout_id = v_item.id ORDER BY position
    LOOP
      INSERT INTO public.workout_exercises (workout_id, sets, reps, rest_seconds, cadence, notes, tempo_notes, position, exercise_id, super_set_id, load_meta_goal, pro_video_url, exercise_name, muscle_group)
      VALUES (v_new_workout_id, v_exercise.sets, v_exercise.reps, v_exercise.rest_seconds, v_exercise.cadence, v_exercise.notes, v_exercise.tempo_notes, v_exercise.position, v_exercise.exercise_id, v_exercise.super_set_id, v_exercise.load_meta_goal, v_exercise.pro_video_url, v_exercise.exercise_name, v_exercise.muscle_group);
    END LOOP;
  END LOOP;
  RETURN v_new_cycle_id;
END;
$$;

-- swap_assignment_workout_from_template (pulse_canvas_edge_rpcs)
CREATE OR REPLACE FUNCTION public.swap_assignment_workout_from_template(
  p_assignment_id uuid,
  p_template_workout_id uuid,
  p_student_user_id uuid,
  p_coach_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_source record;
  v_new_workout_id uuid;
begin
  select * into v_source from workouts where id = p_template_workout_id and pro_id = p_coach_id;
  if not found then
    raise exception 'Workout not found or not owned by coach';
  end if;

  insert into workouts (title, description, owner_id, pro_id, tenant_id, workout_type, source_template_id, is_published, category, level, tags)
  values (
    v_source.title,
    v_source.description,
    p_student_user_id,
    p_coach_id,
    p_student_user_id,
    'coach_individual',
    p_template_workout_id,
    v_source.category,
    v_source.level,
    v_source.tags
  )
  returning id into v_new_workout_id;

  insert into workout_exercises (
    workout_id, exercise_id, sets, reps, rest_seconds, notes, position, cadence, tempo_notes, super_set_id, load_meta_goal, exercise_name, pro_video_url, muscle_group
  )
  select
    v_new_workout_id, we.exercise_id, we.sets, we.reps, we.rest_seconds, we.notes,
    coalesce(we.position, row_number() over (order by we.created_at) - 1), we.cadence, we.tempo_notes, we.super_set_id, we.load_meta_goal, we.exercise_name, we.pro_video_url, we.muscle_group
  from workout_exercises we
  where we.workout_id = p_template_workout_id;

  update student_workout_assignments set workout_id = v_new_workout_id
  where id = p_assignment_id and student_user_id = p_student_user_id;

  return v_new_workout_id;
end;
$$;

-- paste_protocol_cell (same signature as original; exercise_id instead of ymove_exercise_id)
CREATE OR REPLACE FUNCTION public.paste_protocol_cell(
  p_student_id uuid,
  p_cycle_id uuid,
  p_source_week int,
  p_source_day text,
  p_target_week int,
  p_target_day text,
  p_items_per_week int,
  p_coach_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_ok boolean;
  v_source_start int;
  v_source_end int;
  v_target_start int;
  v_target_end int;
  v_src record;
  v_new_workout_id uuid;
  v_next_order int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_coach_id THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT EXISTS (SELECT 1 FROM coach_relationships WHERE student_id = p_student_id AND coach_id = p_coach_id AND status = 'active') INTO v_coach_ok;
  IF NOT coalesce(v_coach_ok, false) THEN RAISE EXCEPTION 'unauthorized'; END IF;

  v_source_start := (p_source_week - 1) * p_items_per_week;
  v_source_end := p_source_week * p_items_per_week;
  v_target_start := (p_target_week - 1) * p_items_per_week;
  v_target_end := p_target_week * p_items_per_week;

  DELETE FROM student_workout_assignments a
  USING workouts w
  WHERE a.workout_id = w.id
    AND a.student_user_id = p_student_id AND a.cycle_id = p_cycle_id AND a.status = 'active'
    AND coalesce(a.order_index, -1) >= v_target_start AND coalesce(a.order_index, -1) < v_target_end
    AND (a.days_of_week = array[p_target_day] OR a.days_of_week @> array[p_target_day]);

  v_next_order := v_target_start;
  FOR v_src IN
    SELECT a.id, a.workout_id, w.title, w.description
    FROM student_workout_assignments a
    JOIN workouts w ON w.id = a.workout_id
    WHERE a.student_user_id = p_student_id AND a.cycle_id = p_cycle_id AND a.status = 'active'
      AND coalesce(a.order_index, -1) >= v_source_start AND coalesce(a.order_index, -1) < v_source_end
      AND (a.days_of_week = array[p_source_day] OR a.days_of_week @> array[p_source_day])
    ORDER BY a.order_index NULLS LAST
  LOOP
    INSERT INTO workouts (title, description, owner_id, pro_id, tenant_id, workout_type, source_id)
    VALUES (v_src.title, v_src.description, p_coach_id, p_coach_id, p_student_id, 'coach_individual', p_student_id)
    RETURNING id INTO v_new_workout_id;

    INSERT INTO workout_exercises (workout_id, exercise_id, sets, reps, rest_seconds, notes, position, cadence, tempo_notes, super_set_id, load_meta_goal, exercise_name, pro_video_url)
    SELECT v_new_workout_id, we.exercise_id, we.sets, we.reps, we.rest_seconds, we.notes, coalesce(we.position, row_number() OVER (ORDER BY we.created_at) - 1), we.cadence, we.tempo_notes, we.super_set_id, we.load_meta_goal, we.exercise_name, we.pro_video_url
    FROM workout_exercises we
    WHERE we.workout_id = v_src.workout_id;

    INSERT INTO student_workout_assignments (student_user_id, workout_id, cycle_id, source_type, source_id, status, days_of_week, order_index)
    VALUES (p_student_id, v_new_workout_id, p_cycle_id, 'coach', p_coach_id, 'active', array[p_target_day], v_next_order);
    v_next_order := v_next_order + 1;
  END LOOP;
END;
$$;

-- grant_purchased_workout_to_student
CREATE OR REPLACE FUNCTION public.grant_purchased_workout_to_student(
  p_workout_template_id uuid,
  p_student_id uuid,
  p_coach_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template workouts%ROWTYPE;
  v_cycle_id uuid;
  v_new_workout_id uuid;
  v_order_index int;
BEGIN
  SELECT * INTO v_template FROM workouts WHERE id = p_workout_template_id;
  IF v_template.id IS NULL THEN RAISE EXCEPTION 'workout_not_found: treino % não encontrado.', p_workout_template_id; END IF;
  IF v_template.owner_id IS DISTINCT FROM p_coach_id AND v_template.pro_id IS DISTINCT FROM p_coach_id AND v_template.tenant_id IS DISTINCT FROM p_coach_id THEN
    RAISE EXCEPTION 'unauthorized: treino não pertence ao coach %.', p_coach_id;
  END IF;

  SELECT id INTO v_cycle_id FROM workout_cycles
  WHERE coach_id = p_coach_id AND student_id = p_student_id AND name = 'Treinos comprados' AND source_protocol_id IS NULL LIMIT 1;
  IF v_cycle_id IS NULL THEN
    INSERT INTO workout_cycles (coach_id, student_id, name, description, source_protocol_id, status, starts_at, duration_weeks)
    VALUES (p_coach_id, p_student_id, 'Treinos comprados', 'Treinos adquiridos no Market.', NULL, 'active', CURRENT_DATE, 999)
    RETURNING id INTO v_cycle_id;
  END IF;

  INSERT INTO workouts (title, description, owner_id, pro_id, tenant_id, workout_type, source_template_id, source_id, category, level, tags, coach_video_url, is_published)
  VALUES (v_template.title, v_template.description, p_coach_id, p_coach_id, p_student_id, 'coach_individual', p_workout_template_id, p_student_id, v_template.category, v_template.level, v_template.tags, v_template.coach_video_url, false)
  RETURNING id INTO v_new_workout_id;

  INSERT INTO workout_exercises (workout_id, exercise_id, sets, reps, rest_seconds, notes, position, cadence, tempo_notes, super_set_id, load_meta_goal, exercise_name, pro_video_url, muscle_group)
  SELECT v_new_workout_id, we.exercise_id, we.sets, we.reps, we.rest_seconds, we.notes, COALESCE(we.position, (row_number() OVER (ORDER BY we.created_at, we.id))::INT - 1), we.cadence, we.tempo_notes, we.super_set_id, we.load_meta_goal, we.exercise_name, we.pro_video_url, we.muscle_group
  FROM workout_exercises we
  WHERE we.workout_id = p_workout_template_id;

  SELECT COALESCE(MAX(order_index), -1) + 1 INTO v_order_index FROM student_workout_assignments WHERE cycle_id = v_cycle_id;
  INSERT INTO student_workout_assignments (student_user_id, workout_id, cycle_id, source_type, source_id, status, days_of_week, order_index)
  VALUES (p_student_id, v_new_workout_id, v_cycle_id, 'coach', p_coach_id, 'active', ARRAY['SEG'], v_order_index);
  RETURN v_new_workout_id;
END;
$$;

-- copy_protocol_week (same signature as original; exercise_id instead of ymove_exercise_id)
CREATE OR REPLACE FUNCTION public.copy_protocol_week(
  p_student_id uuid,
  p_cycle_id uuid,
  p_source_week int,
  p_target_week int,
  p_items_per_week int,
  p_coach_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src record;
  v_new_workout_id uuid;
  v_next_order int;
  v_source_start int;
  v_source_end int;
BEGIN
  v_source_start := (p_source_week - 1) * p_items_per_week;
  v_source_end := p_source_week * p_items_per_week;
  v_next_order := (p_target_week - 1) * p_items_per_week;

  FOR v_src IN
    SELECT w.id AS workout_id, w.title, w.description, a.days_of_week
    FROM student_workout_assignments a
    JOIN workouts w ON w.id = a.workout_id
    WHERE a.student_user_id = p_student_id AND a.cycle_id = p_cycle_id AND a.status = 'active'
      AND coalesce(a.order_index, -1) >= v_source_start AND coalesce(a.order_index, -1) < v_source_end
    ORDER BY a.order_index NULLS LAST
  LOOP
    INSERT INTO workouts (title, description, owner_id, pro_id, tenant_id, workout_type, source_id)
    VALUES (v_src.title, v_src.description, p_coach_id, p_coach_id, p_student_id, 'coach_individual', p_student_id)
    RETURNING id INTO v_new_workout_id;

    INSERT INTO workout_exercises (workout_id, exercise_id, sets, reps, rest_seconds, notes, position, cadence, tempo_notes, super_set_id, load_meta_goal, exercise_name, pro_video_url)
    SELECT v_new_workout_id, we.exercise_id, we.sets, we.reps, we.rest_seconds, we.notes, coalesce(we.position, row_number() OVER (ORDER BY we.created_at) - 1), we.cadence, we.tempo_notes, we.super_set_id, we.load_meta_goal, we.exercise_name, we.pro_video_url
    FROM workout_exercises we
    WHERE we.workout_id = v_src.workout_id;

    INSERT INTO student_workout_assignments (student_user_id, workout_id, cycle_id, source_type, source_id, status, days_of_week, order_index)
    VALUES (p_student_id, v_new_workout_id, p_cycle_id, 'coach', p_coach_id, 'active', coalesce(v_src.days_of_week, '{}'), v_next_order);
    v_next_order := v_next_order + 1;
  END LOOP;
END;
$$;

COMMIT;
