-- Auditoria MVP 1-6 + 6D: hardening world-class para programas por nicho.
-- P0: gate premium server-side, RLS real para conteúdo premium e criação atômica
-- de programa + semanas + sessões pelo coach.

CREATE INDEX IF NOT EXISTS subscriptions_subscriber_creator_status_idx
  ON public.subscriptions (subscriber_id, creator_id, status, current_period_end);

CREATE INDEX IF NOT EXISTS pulse_subscriptions_student_coach_status_idx
  ON public.pulse_subscriptions (student_id, coach_id, status, current_period_end);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public;
GRANT USAGE ON SCHEMA private TO anon, authenticated;

-- SECURITY DEFINER: communities podem ser members-only por RLS; esta RPC expõe
-- somente campos públicos de vitrine e valida a taxonomia de esporte.
CREATE OR REPLACE FUNCTION public.discover_communities_by_sport(p_sport text)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  member_count integer,
  sports text[],
  creator_id uuid,
  creator_username text,
  creator_full_name text,
  creator_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT c.id, c.name, c.description, c.member_count, c.sports,
         c.creator_id, pf.username, pf.full_name, pf.avatar_url
  FROM public.communities c
  JOIN public.profiles pf ON pf.id = c.creator_id
  WHERE p_sport IN ('cycling','martial_arts','bodybuilding','running','triathlon','crossfit')
    AND p_sport = ANY (c.sports)
  ORDER BY c.member_count DESC NULLS LAST, c.created_at DESC
  LIMIT 24;
$$;

REVOKE EXECUTE ON FUNCTION public.discover_communities_by_sport(text) FROM public;
GRANT EXECUTE ON FUNCTION public.discover_communities_by_sport(text) TO anon, authenticated;

-- SECURITY DEFINER: usado exclusivamente como gate de entitlement em RLS/RPC.
-- A função lê assinaturas e metadados de programa que o cliente não deve juntar
-- diretamente; o retorno é uma enum textual sem PII.
CREATE OR REPLACE FUNCTION private.training_program_entitlement_source(p_program_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH p AS (
    SELECT id, owner_id, source, is_published, is_premium
    FROM public.training_programs
    WHERE id = p_program_id
  ),
  entitlement AS (
    SELECT CASE
      WHEN p.is_published = false AND p.owner_id IS DISTINCT FROM p_user_id THEN 'not_found'
      WHEN p.source = 'system' THEN 'system'
      WHEN p.is_published = true AND (p.is_premium = false OR p.owner_id IS NULL) THEN 'free'
      WHEN p_user_id IS NULL THEN 'unauthenticated'
      WHEN p.owner_id = p_user_id THEN 'owner'
      WHEN EXISTS (
        SELECT 1
        FROM public.subscriptions s
        WHERE s.subscriber_id = p_user_id
          AND s.creator_id = p.owner_id
          AND lower(coalesce(s.status, '')) = 'active'
          AND (s.current_period_end IS NULL OR s.current_period_end > now())
      ) THEN 'subscription'
      WHEN EXISTS (
        SELECT 1
        FROM public.pulse_subscriptions ps
        WHERE ps.student_id = p_user_id
          AND ps.coach_id = p.owner_id
          AND upper(coalesce(ps.status, '')) IN ('ACTIVE', 'TRIALING')
          AND coalesce(ps.pause_status, '') <> 'paused'
          AND (ps.current_period_end IS NULL OR ps.current_period_end > now())
      ) THEN 'pulse_subscription'
      ELSE NULL
    END AS source
    FROM p
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM p) THEN 'not_found'
    ELSE (SELECT source FROM entitlement)
  END;
$$;

REVOKE EXECUTE ON FUNCTION private.training_program_entitlement_source(uuid, uuid) FROM public;

-- SECURITY DEFINER: wrapper booleano para policies RLS; evita duplicar joins de
-- entitlement em cada tabela filha de programas.
CREATE OR REPLACE FUNCTION private.can_access_training_program(p_program_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT private.training_program_entitlement_source(p_program_id, p_user_id)
    IN ('system', 'owner', 'free', 'subscription', 'pulse_subscription');
$$;

REVOKE EXECUTE ON FUNCTION private.can_access_training_program(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION private.can_access_training_program(uuid, uuid) TO anon, authenticated;

-- SECURITY DEFINER: endpoint público seguro do gate premium. Sempre usa auth.uid()
-- internamente e retorna apenas can_view/locked_reason/entitlement_source.
CREATE OR REPLACE FUNCTION public.training_program_access(p_program_id uuid)
RETURNS TABLE (
  program_id uuid,
  can_view boolean,
  locked_reason text,
  entitlement_source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH entitlement AS (
    SELECT private.training_program_entitlement_source(p_program_id, (select auth.uid())) AS source
  )
  SELECT
    p_program_id AS program_id,
    entitlement.source IS NOT NULL
      AND entitlement.source NOT IN ('not_found', 'unauthenticated') AS can_view,
    CASE
      WHEN entitlement.source = 'not_found' THEN 'not_found'
      WHEN entitlement.source = 'unauthenticated' THEN 'unauthenticated'
      WHEN entitlement.source IS NULL THEN 'premium_required'
      ELSE NULL
    END AS locked_reason,
    entitlement.source AS entitlement_source
  FROM entitlement;
$$;

REVOKE EXECUTE ON FUNCTION public.training_program_access(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.training_program_access(uuid) TO anon, authenticated;

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;

  IF nullif(p_payload->>'durationWeeks', '') IS NOT NULL THEN
    IF (p_payload->>'durationWeeks') !~ '^\d+$' THEN
      RAISE EXCEPTION 'invalid_duration';
    END IF;
    v_duration_weeks := (p_payload->>'durationWeeks')::int;
  END IF;
  IF nullif(p_payload->>'weeklySessions', '') IS NOT NULL THEN
    IF (p_payload->>'weeklySessions') !~ '^\d+$' THEN
      RAISE EXCEPTION 'invalid_weekly_sessions';
    END IF;
    v_weekly_sessions := nullif((p_payload->>'weeklySessions')::int, 0);
  END IF;
  IF nullif(p_payload->>'estMinutesPerWeek', '') IS NOT NULL THEN
    IF (p_payload->>'estMinutesPerWeek') !~ '^\d+$' THEN
      RAISE EXCEPTION 'invalid_est_minutes_per_week';
    END IF;
    v_est_minutes_per_week := nullif((p_payload->>'estMinutesPerWeek')::int, 0);
  END IF;
  IF nullif(p_payload->>'isPremium', '') IS NOT NULL THEN
    IF lower(p_payload->>'isPremium') NOT IN ('true', 'false') THEN
      RAISE EXCEPTION 'invalid_premium_flag';
    END IF;
    v_is_premium := (p_payload->>'isPremium')::boolean;
  END IF;
  IF nullif(p_payload->>'isPublished', '') IS NOT NULL THEN
    IF lower(p_payload->>'isPublished') NOT IN ('true', 'false') THEN
      RAISE EXCEPTION 'invalid_published_flag';
    END IF;
    v_is_published := (p_payload->>'isPublished')::boolean;
  END IF;
  IF jsonb_typeof(coalesce(p_payload->'weeks', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_weeks';
  END IF;
  IF jsonb_typeof(coalesce(p_payload->'sessions', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_sessions';
  END IF;
  IF jsonb_typeof(coalesce(p_payload->'equipment', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_equipment';
  END IF;

  v_week_count := jsonb_array_length(coalesce(p_payload->'weeks', '[]'::jsonb));
  v_session_count := jsonb_array_length(coalesce(p_payload->'sessions', '[]'::jsonb));

  IF v_sport NOT IN ('cycling','martial_arts','bodybuilding','running','triathlon','crossfit') THEN
    RAISE EXCEPTION 'invalid_sport';
  END IF;
  IF v_sport = 'martial_arts' THEN
    RAISE EXCEPTION 'programs_not_supported_for_sport';
  END IF;
  IF length(v_name) < 3 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF v_goal IS NOT NULL AND length(v_goal) > 180 THEN
    RAISE EXCEPTION 'invalid_goal';
  END IF;
  IF v_description IS NOT NULL AND length(v_description) > 2000 THEN
    RAISE EXCEPTION 'invalid_description';
  END IF;
  IF v_level NOT IN ('beginner','intermediate','advanced') THEN
    RAISE EXCEPTION 'invalid_level';
  END IF;
  IF v_duration_weeks < 1 OR v_duration_weeks > 52 THEN
    RAISE EXCEPTION 'invalid_duration';
  END IF;
  IF v_weekly_sessions IS NOT NULL AND (v_weekly_sessions < 1 OR v_weekly_sessions > 7) THEN
    RAISE EXCEPTION 'invalid_weekly_sessions';
  END IF;
  IF v_est_minutes_per_week IS NOT NULL AND (v_est_minutes_per_week < 1 OR v_est_minutes_per_week > 3000) THEN
    RAISE EXCEPTION 'invalid_est_minutes_per_week';
  END IF;
  IF v_week_count <> v_duration_weeks THEN
    RAISE EXCEPTION 'invalid_week_count';
  END IF;
  IF v_session_count < 1 OR v_session_count > (v_duration_weeks * 7) THEN
    RAISE EXCEPTION 'invalid_session_count';
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
    v_uid, 50, jsonb_build_object('builder', 'coach_program_builder_v2')
  )
  RETURNING id INTO v_program_id;

  FOR v_week_rec IN
    SELECT *
    FROM jsonb_to_recordset(p_payload->'weeks') AS x(
      week int,
      phase text,
      "targetMinutes" int
    )
  LOOP
    IF v_week_rec.week < 1 OR v_week_rec.week > v_duration_weeks THEN
      RAISE EXCEPTION 'invalid_week';
    END IF;
    IF v_week_rec.phase NOT IN ('base','build','peak','taper','deload','skill') THEN
      RAISE EXCEPTION 'invalid_phase';
    END IF;
    IF v_week_rec."targetMinutes" IS NOT NULL
       AND (v_week_rec."targetMinutes" < 1 OR v_week_rec."targetMinutes" > 3000) THEN
      RAISE EXCEPTION 'invalid_week_target';
    END IF;

    INSERT INTO public.training_program_weeks (program_id, week, phase, target_minutes, focus_i18n_key)
    VALUES (v_program_id, v_week_rec.week, v_week_rec.phase, v_week_rec."targetMinutes", NULL);
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
    IF jsonb_typeof(v_target) <> 'object' THEN
      RAISE EXCEPTION 'invalid_target';
    END IF;
    IF v_session_rec.week < 1 OR v_session_rec.week > v_duration_weeks THEN
      RAISE EXCEPTION 'invalid_session_week';
    END IF;
    IF v_session_rec.day < 1 OR v_session_rec.day > 7 THEN
      RAISE EXCEPTION 'invalid_session_day';
    END IF;
    IF v_session_rec."sessionType" NOT IN (
      'rest','mobility','easy','long','tempo','intervals','recovery','fartlek','strides','race_pace',
      'endurance','sweet_spot','threshold','vo2','cadence','long_ride','recovery_spin',
      'swim','bike','run','brick','transition',
      'skill','strength','metcon','emom','amrap','for_time','conditioning',
      'push','pull','legs','upper','lower','full_body','hypertrophy','strength_lift','deload'
    ) THEN
      RAISE EXCEPTION 'invalid_session_type';
    END IF;
    IF v_session_rec."estMinutes" IS NOT NULL
       AND (v_session_rec."estMinutes" < 1 OR v_session_rec."estMinutes" > 600) THEN
      RAISE EXCEPTION 'invalid_session_minutes';
    END IF;

    IF nullif(v_target #>> '{intensity,zone}', '') IS NOT NULL
       AND (v_target #>> '{intensity,zone}') !~ '^\d+$' THEN
      RAISE EXCEPTION 'invalid_zone';
    END IF;
    IF nullif(v_target #>> '{intensity,rpe}', '') IS NOT NULL
       AND (v_target #>> '{intensity,rpe}') !~ '^\d+$' THEN
      RAISE EXCEPTION 'invalid_rpe';
    END IF;

    v_zone := nullif(v_target #>> '{intensity,zone}', '')::int;
    v_rpe := nullif(v_target #>> '{intensity,rpe}', '')::int;
    IF v_zone IS NOT NULL AND (v_zone < 1 OR v_zone > 6) THEN
      RAISE EXCEPTION 'invalid_zone';
    END IF;
    IF v_rpe IS NOT NULL AND (v_rpe < 1 OR v_rpe > 10) THEN
      RAISE EXCEPTION 'invalid_rpe';
    END IF;
    IF length(trim(coalesce(v_session_rec.title, ''))) < 3 OR length(trim(coalesce(v_session_rec.title, ''))) > 120 THEN
      RAISE EXCEPTION 'invalid_session_title';
    END IF;
    IF v_session_rec.description IS NOT NULL AND length(trim(v_session_rec.description)) > 1200 THEN
      RAISE EXCEPTION 'invalid_session_description';
    END IF;

    INSERT INTO public.training_program_sessions (
      program_id, week, day, position, title, description, session_type, est_minutes, target
    )
    VALUES (
      v_program_id,
      v_session_rec.week,
      v_session_rec.day,
      coalesce(v_session_rec.position, 0),
      nullif(trim(coalesce(v_session_rec.title, '')), ''),
      nullif(trim(coalesce(v_session_rec.description, '')), ''),
      v_session_rec."sessionType",
      v_session_rec."estMinutes",
      v_target
    );
  END LOOP;

  RETURN v_program_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_coach_training_program(jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_coach_training_program(jsonb) TO authenticated;

-- RLS: o conteúdo premium deixa de depender de gate client-side.
DROP POLICY IF EXISTS "training_programs_select" ON public.training_programs;
CREATE POLICY "training_programs_select" ON public.training_programs
  FOR SELECT USING (is_published = true OR owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "tps_select" ON public.training_program_sessions;
CREATE POLICY "tps_select" ON public.training_program_sessions
  FOR SELECT TO anon, authenticated USING (private.can_access_training_program(program_id, (select auth.uid())));

DROP POLICY IF EXISTS "tpw_select" ON public.training_program_weeks;
CREATE POLICY "tpw_select" ON public.training_program_weeks
  FOR SELECT TO anon, authenticated USING (private.can_access_training_program(program_id, (select auth.uid())));

DROP POLICY IF EXISTS "tpe_insert_self" ON public.training_program_enrollments;
CREATE POLICY "tpe_insert_self" ON public.training_program_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()) AND private.can_access_training_program(program_id, (select auth.uid())));

DROP POLICY IF EXISTS "tpe_select_self" ON public.training_program_enrollments;
CREATE POLICY "tpe_select_self" ON public.training_program_enrollments
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) AND private.can_access_training_program(program_id, (select auth.uid())));

DROP POLICY IF EXISTS "tpe_update_self" ON public.training_program_enrollments;
CREATE POLICY "tpe_update_self" ON public.training_program_enrollments
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()) AND private.can_access_training_program(program_id, (select auth.uid())))
  WITH CHECK (user_id = (select auth.uid()) AND private.can_access_training_program(program_id, (select auth.uid())));

DROP POLICY IF EXISTS "tpe_delete_self" ON public.training_program_enrollments;
CREATE POLICY "tpe_delete_self" ON public.training_program_enrollments
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()) AND private.can_access_training_program(program_id, (select auth.uid())));

DROP POLICY IF EXISTS "tpsp_all_self" ON public.training_program_session_progress;
CREATE POLICY "tpsp_all_self" ON public.training_program_session_progress
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.training_program_enrollments e
    WHERE e.id = enrollment_id
      AND e.user_id = (select auth.uid())
      AND private.can_access_training_program(e.program_id, (select auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.training_program_enrollments e
    WHERE e.id = enrollment_id
      AND e.user_id = (select auth.uid())
      AND private.can_access_training_program(e.program_id, (select auth.uid()))
  ));
