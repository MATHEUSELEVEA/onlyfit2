ALTER TABLE public.training_program_weeks
  DROP CONSTRAINT IF EXISTS training_program_weeks_phase_check;

ALTER TABLE public.training_program_weeks
  ADD CONSTRAINT training_program_weeks_phase_check
  CHECK (phase IN ('transition','prep','base','build','peak','race','taper','deload','skill'));

ALTER TABLE public.training_program_weeks
  ADD COLUMN IF NOT EXISTS target_tss numeric,
  ADD COLUMN IF NOT EXISTS is_recovery boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS platform_fee_pct numeric NOT NULL DEFAULT 30
  CHECK (platform_fee_pct >= 0 AND platform_fee_pct <= 100);

CREATE TABLE IF NOT EXISTS public.athlete_training_zones (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  ftp_watts integer CHECK (ftp_watts IS NULL OR (ftp_watts BETWEEN 50 AND 800)),
  threshold_pace_s_per_km integer CHECK (threshold_pace_s_per_km IS NULL OR (threshold_pace_s_per_km BETWEEN 120 AND 1200)),
  threshold_hr_bpm integer CHECK (threshold_hr_bpm IS NULL OR (threshold_hr_bpm BETWEEN 60 AND 240)),
  max_hr_bpm integer CHECK (max_hr_bpm IS NULL OR (max_hr_bpm BETWEEN 80 AND 260)),
  swim_css_s_per_100m integer CHECK (swim_css_s_per_100m IS NULL OR (swim_css_s_per_100m BETWEEN 45 AND 300)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.program_session_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.training_program_enrollments(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.training_program_sessions(id) ON DELETE CASCADE,
  engine text NOT NULL CHECK (engine IN ('endurance','crossfit','combat')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, session_id)
);

CREATE INDEX IF NOT EXISTS program_session_results_enrollment_idx
  ON public.program_session_results (enrollment_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS program_session_results_session_idx
  ON public.program_session_results (session_id);

ALTER TABLE public.athlete_training_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_session_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atz_select_self" ON public.athlete_training_zones;
CREATE POLICY "atz_select_self" ON public.athlete_training_zones
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "atz_insert_self" ON public.athlete_training_zones;
CREATE POLICY "atz_insert_self" ON public.athlete_training_zones
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "atz_update_self" ON public.athlete_training_zones;
CREATE POLICY "atz_update_self" ON public.athlete_training_zones
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "psr_select_self" ON public.program_session_results;
CREATE POLICY "psr_select_self" ON public.program_session_results
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.training_program_enrollments e
      JOIN public.training_program_sessions s ON s.id = session_id AND s.program_id = e.program_id
      WHERE e.id = enrollment_id AND e.user_id = (select auth.uid())
    )
  );
DROP POLICY IF EXISTS "psr_insert_self" ON public.program_session_results;
CREATE POLICY "psr_insert_self" ON public.program_session_results
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.training_program_enrollments e
      JOIN public.training_program_sessions s ON s.id = session_id AND s.program_id = e.program_id
      WHERE e.id = enrollment_id AND e.user_id = (select auth.uid())
    )
  );
DROP POLICY IF EXISTS "psr_update_self" ON public.program_session_results;
CREATE POLICY "psr_update_self" ON public.program_session_results
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.training_program_enrollments e
      JOIN public.training_program_sessions s ON s.id = session_id AND s.program_id = e.program_id
      WHERE e.id = enrollment_id AND e.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.training_program_enrollments e
      JOIN public.training_program_sessions s ON s.id = session_id AND s.program_id = e.program_id
      WHERE e.id = enrollment_id AND e.user_id = (select auth.uid())
    )
  );
DROP POLICY IF EXISTS "psr_delete_self" ON public.program_session_results;
CREATE POLICY "psr_delete_self" ON public.program_session_results
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.training_program_enrollments e
      JOIN public.training_program_sessions s ON s.id = session_id AND s.program_id = e.program_id
      WHERE e.id = enrollment_id AND e.user_id = (select auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.athlete_training_zones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_session_results TO authenticated;

CREATE OR REPLACE FUNCTION public.create_coach_training_program(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_program_id uuid;
  v_sport text := trim(coalesce(p_payload->>'sport', ''));
  v_name text := trim(coalesce(p_payload->>'name', ''));
  v_goal text := nullif(trim(coalesce(p_payload->>'goal', '')), '');
  v_description text := nullif(trim(coalesce(p_payload->>'description', '')), '');
  v_level text := trim(coalesce(p_payload->>'level', 'beginner'));
  v_distribution text := trim(coalesce(p_payload->>'distribution', 'free'));
  v_duration_weeks int := 4;
  v_weekly_sessions int;
  v_est_minutes_per_week int;
  v_is_premium boolean := false;
  v_is_published boolean := true;
  v_equipment text[] := '{}';
  v_week_count int := 0;
  v_session_count int := 0;
  v_week_rec record;
  v_session_rec record;
  v_target jsonb;
  v_zone int;
  v_rpe int;
  v_product jsonb := coalesce(p_payload->'product', '{}'::jsonb);
  v_product_enabled boolean := false;
  v_price_public numeric;
  v_price_student numeric;
  v_price_member numeric;
  v_platform_fee_pct numeric := 30;
  v_free_students boolean := false;
  v_free_members boolean := false;
  v_product_description text;
  v_thumbnail_url text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'invalid_payload'; END IF;
  IF v_distribution NOT IN ('free', 'subscribers', 'one_time', 'both') THEN RAISE EXCEPTION 'invalid_distribution'; END IF;

  IF nullif(p_payload->>'durationWeeks', '') IS NOT NULL THEN
    IF (p_payload->>'durationWeeks') !~ '^\d+$' THEN RAISE EXCEPTION 'invalid_duration'; END IF;
    v_duration_weeks := (p_payload->>'durationWeeks')::int;
  END IF;
  IF nullif(p_payload->>'weeklySessions', '') IS NOT NULL THEN
    IF (p_payload->>'weeklySessions') !~ '^\d+$' THEN RAISE EXCEPTION 'invalid_weekly_sessions'; END IF;
    v_weekly_sessions := nullif((p_payload->>'weeklySessions')::int, 0);
  END IF;
  IF nullif(p_payload->>'estMinutesPerWeek', '') IS NOT NULL THEN
    IF (p_payload->>'estMinutesPerWeek') !~ '^\d+$' THEN RAISE EXCEPTION 'invalid_est_minutes_per_week'; END IF;
    v_est_minutes_per_week := nullif((p_payload->>'estMinutesPerWeek')::int, 0);
  END IF;
  IF nullif(p_payload->>'isPublished', '') IS NOT NULL THEN
    IF lower(p_payload->>'isPublished') NOT IN ('true', 'false') THEN RAISE EXCEPTION 'invalid_published_flag'; END IF;
    v_is_published := (p_payload->>'isPublished')::boolean;
  END IF;
  v_is_premium := v_distribution <> 'free';

  IF jsonb_typeof(coalesce(p_payload->'weeks', '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'invalid_weeks'; END IF;
  IF jsonb_typeof(coalesce(p_payload->'sessions', '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'invalid_sessions'; END IF;
  IF jsonb_typeof(coalesce(p_payload->'equipment', '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'invalid_equipment'; END IF;
  IF jsonb_typeof(v_product) <> 'object' THEN RAISE EXCEPTION 'invalid_product'; END IF;

  v_week_count := jsonb_array_length(coalesce(p_payload->'weeks', '[]'::jsonb));
  v_session_count := jsonb_array_length(coalesce(p_payload->'sessions', '[]'::jsonb));

  IF v_sport NOT IN ('cycling','running','triathlon','crossfit','martial_arts') THEN RAISE EXCEPTION 'invalid_sport'; END IF;
  IF length(v_name) < 3 OR length(v_name) > 120 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF v_goal IS NOT NULL AND length(v_goal) > 180 THEN RAISE EXCEPTION 'invalid_goal'; END IF;
  IF v_description IS NOT NULL AND length(v_description) > 2000 THEN RAISE EXCEPTION 'invalid_description'; END IF;
  IF v_level NOT IN ('beginner','intermediate','advanced') THEN RAISE EXCEPTION 'invalid_level'; END IF;
  IF v_duration_weeks < 1 OR v_duration_weeks > 52 THEN RAISE EXCEPTION 'invalid_duration'; END IF;
  IF v_weekly_sessions IS NOT NULL AND (v_weekly_sessions < 1 OR v_weekly_sessions > 7) THEN RAISE EXCEPTION 'invalid_weekly_sessions'; END IF;
  IF v_est_minutes_per_week IS NOT NULL AND (v_est_minutes_per_week < 1 OR v_est_minutes_per_week > 3000) THEN RAISE EXCEPTION 'invalid_est_minutes_per_week'; END IF;
  IF v_week_count <> v_duration_weeks THEN RAISE EXCEPTION 'invalid_week_count'; END IF;
  IF v_session_count < 1 OR v_session_count > (v_duration_weeks * 7) THEN RAISE EXCEPTION 'invalid_session_count'; END IF;

  IF nullif(v_product->>'enabled', '') IS NOT NULL THEN
    IF lower(v_product->>'enabled') NOT IN ('true', 'false') THEN RAISE EXCEPTION 'invalid_product_enabled'; END IF;
    v_product_enabled := (v_product->>'enabled')::boolean;
  END IF;
  IF v_distribution IN ('one_time', 'both') AND v_product_enabled IS NOT TRUE THEN RAISE EXCEPTION 'product_required_for_distribution'; END IF;
  IF v_distribution IN ('free', 'subscribers') AND v_product_enabled IS TRUE THEN RAISE EXCEPTION 'invalid_product_for_distribution'; END IF;
  IF v_product_enabled AND v_is_published IS NOT TRUE THEN RAISE EXCEPTION 'product_requires_published_program'; END IF;

  IF v_product_enabled THEN
    IF nullif(v_product->>'pricePublic', '') IS NULL OR (v_product->>'pricePublic') !~ '^\d+(\.\d{1,2})?$' THEN RAISE EXCEPTION 'invalid_product_price'; END IF;
    v_price_public := (v_product->>'pricePublic')::numeric;
    IF v_price_public < 1 OR v_price_public > 999999 THEN RAISE EXCEPTION 'invalid_product_price'; END IF;
    IF nullif(v_product->>'priceStudent', '') IS NOT NULL THEN
      IF (v_product->>'priceStudent') !~ '^\d+(\.\d{1,2})?$' THEN RAISE EXCEPTION 'invalid_student_price'; END IF;
      v_price_student := (v_product->>'priceStudent')::numeric;
    END IF;
    IF nullif(v_product->>'priceMember', '') IS NOT NULL THEN
      IF (v_product->>'priceMember') !~ '^\d+(\.\d{1,2})?$' THEN RAISE EXCEPTION 'invalid_member_price'; END IF;
      v_price_member := (v_product->>'priceMember')::numeric;
    END IF;
    IF v_price_student IS NOT NULL AND (v_price_student < 0 OR v_price_student > 999999) THEN RAISE EXCEPTION 'invalid_student_price'; END IF;
    IF v_price_member IS NOT NULL AND (v_price_member < 0 OR v_price_member > 999999) THEN RAISE EXCEPTION 'invalid_member_price'; END IF;

    IF nullif(v_product->>'platformFeePct', '') IS NOT NULL THEN
      IF (v_product->>'platformFeePct') !~ '^\d+(\.\d{1,2})?$' THEN RAISE EXCEPTION 'invalid_platform_fee'; END IF;
      v_platform_fee_pct := (v_product->>'platformFeePct')::numeric;
    END IF;
    IF v_platform_fee_pct < 0 OR v_platform_fee_pct > 100 THEN RAISE EXCEPTION 'invalid_platform_fee'; END IF;

    v_free_students := coalesce((v_product->>'isFreeForStudents')::boolean, false);
    v_free_members := coalesce((v_product->>'isFreeForMembers')::boolean, false);
    v_product_description := nullif(trim(coalesce(v_product->>'description', '')), '');
    v_thumbnail_url := nullif(trim(coalesce(v_product->>'thumbnailUrl', '')), '');
    IF v_product_description IS NOT NULL AND length(v_product_description) > 500 THEN RAISE EXCEPTION 'invalid_product_description'; END IF;
    IF v_thumbnail_url IS NOT NULL AND length(v_thumbnail_url) > 2048 THEN RAISE EXCEPTION 'invalid_product_thumbnail'; END IF;
  END IF;

  SELECT coalesce(array_agg(item), '{}') INTO v_equipment
  FROM (
    SELECT left(trim(value), 40) AS item
    FROM jsonb_array_elements_text(coalesce(p_payload->'equipment', '[]'::jsonb)) AS e(value)
    WHERE trim(value) <> ''
    LIMIT 20
  ) q;

  INSERT INTO public.training_programs (
    sport, name, goal, description, level, duration_weeks, weekly_sessions,
    est_minutes_per_week, equipment, is_premium, is_published, source,
    owner_id, sort_order, meta
  )
  VALUES (
    v_sport, v_name, v_goal, v_description, v_level, v_duration_weeks, v_weekly_sessions,
    v_est_minutes_per_week, v_equipment, v_is_premium, v_is_published, 'coach',
    v_uid, 50, jsonb_build_object('builder', 'coach_program_builder_v3', 'distribution', v_distribution)
  )
  RETURNING id INTO v_program_id;

  IF v_product_enabled THEN
    INSERT INTO public.products (
      tenant_id, creator_id, name, description, type, category, market_item_type, source_id,
      price, price_public, price_student, price_member, is_free_for_students, is_free_for_members,
      thumbnail_url, cover_image_url, is_published, is_recurring, active, access_mode, platform_fee_pct
    )
    VALUES (
      v_uid, v_uid, v_name, coalesce(v_product_description, v_description, v_goal), 'programa', 'digital',
      'training_program', v_program_id, v_price_public, v_price_public, coalesce(v_price_student, v_price_public),
      coalesce(v_price_member, v_price_public), v_free_students, v_free_members, v_thumbnail_url, v_thumbnail_url,
      true, false, true, 'lifetime', v_platform_fee_pct
    );
  END IF;

  FOR v_week_rec IN
    SELECT *
    FROM jsonb_to_recordset(p_payload->'weeks') AS x(
      week int,
      phase text,
      "targetMinutes" int,
      "targetTss" numeric,
      "isRecovery" boolean
    )
  LOOP
    IF v_week_rec.week < 1 OR v_week_rec.week > v_duration_weeks THEN RAISE EXCEPTION 'invalid_week'; END IF;
    IF v_week_rec.phase NOT IN ('transition','prep','base','build','peak','race','taper','deload','skill') THEN RAISE EXCEPTION 'invalid_phase'; END IF;
    IF v_week_rec."targetMinutes" IS NOT NULL AND (v_week_rec."targetMinutes" < 1 OR v_week_rec."targetMinutes" > 3000) THEN RAISE EXCEPTION 'invalid_week_target'; END IF;
    IF v_week_rec."targetTss" IS NOT NULL AND (v_week_rec."targetTss" < 0 OR v_week_rec."targetTss" > 5000) THEN RAISE EXCEPTION 'invalid_week_tss'; END IF;

    INSERT INTO public.training_program_weeks (program_id, week, phase, target_minutes, target_tss, is_recovery, focus_i18n_key)
    VALUES (v_program_id, v_week_rec.week, v_week_rec.phase, v_week_rec."targetMinutes", v_week_rec."targetTss", coalesce(v_week_rec."isRecovery", false), NULL);
  END LOOP;

  FOR v_session_rec IN
    SELECT *
    FROM jsonb_to_recordset(p_payload->'sessions') AS x(
      week int,
      day int,
      position int,
      title text,
      description text,
      "sessionType" text,
      "estMinutes" int,
      target jsonb
    )
  LOOP
    v_target := coalesce(v_session_rec.target, '{}'::jsonb);
    IF jsonb_typeof(v_target) <> 'object' THEN RAISE EXCEPTION 'invalid_target'; END IF;
    IF v_session_rec.week < 1 OR v_session_rec.week > v_duration_weeks THEN RAISE EXCEPTION 'invalid_session_week'; END IF;
    IF v_session_rec.day < 1 OR v_session_rec.day > 7 THEN RAISE EXCEPTION 'invalid_session_day'; END IF;
    IF v_session_rec."sessionType" NOT IN (
      'rest','mobility','easy','long','tempo','intervals','recovery','fartlek','strides','race_pace',
      'endurance','sweet_spot','threshold','vo2','cadence','long_ride','recovery_spin',
      'swim','bike','run','brick','transition',
      'skill','strength','metcon','emom','amrap','for_time','conditioning'
    ) THEN RAISE EXCEPTION 'invalid_session_type'; END IF;
    IF v_session_rec."estMinutes" IS NOT NULL AND (v_session_rec."estMinutes" < 1 OR v_session_rec."estMinutes" > 600) THEN RAISE EXCEPTION 'invalid_session_minutes'; END IF;

    IF nullif(v_target #>> '{intensity,zone}', '') IS NOT NULL AND (v_target #>> '{intensity,zone}') !~ '^\d+$' THEN RAISE EXCEPTION 'invalid_zone'; END IF;
    IF nullif(v_target #>> '{intensity,rpe}', '') IS NOT NULL AND (v_target #>> '{intensity,rpe}') !~ '^\d+$' THEN RAISE EXCEPTION 'invalid_rpe'; END IF;
    v_zone := nullif(v_target #>> '{intensity,zone}', '')::int;
    v_rpe := nullif(v_target #>> '{intensity,rpe}', '')::int;
    IF v_zone IS NOT NULL AND (v_zone < 1 OR v_zone > 6) THEN RAISE EXCEPTION 'invalid_zone'; END IF;
    IF v_rpe IS NOT NULL AND (v_rpe < 1 OR v_rpe > 10) THEN RAISE EXCEPTION 'invalid_rpe'; END IF;
    IF length(trim(coalesce(v_session_rec.title, ''))) < 3 OR length(trim(coalesce(v_session_rec.title, ''))) > 120 THEN RAISE EXCEPTION 'invalid_session_title'; END IF;
    IF v_session_rec.description IS NOT NULL AND length(trim(v_session_rec.description)) > 1200 THEN RAISE EXCEPTION 'invalid_session_description'; END IF;

    INSERT INTO public.training_program_sessions (
      program_id, week, day, position, title, description, session_type, est_minutes, target
    )
    VALUES (
      v_program_id, v_session_rec.week, v_session_rec.day, coalesce(v_session_rec.position, 0),
      nullif(trim(coalesce(v_session_rec.title, '')), ''),
      nullif(trim(coalesce(v_session_rec.description, '')), ''),
      v_session_rec."sessionType", v_session_rec."estMinutes", v_target
    );
  END LOOP;

  RETURN v_program_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_coach_training_program(jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_coach_training_program(jsonb) TO authenticated;
