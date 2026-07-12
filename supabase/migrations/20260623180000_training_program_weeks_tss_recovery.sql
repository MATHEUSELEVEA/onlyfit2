-- add target_tss + is_recovery to weeks (the builder UI already sends them)
ALTER TABLE public.training_program_weeks
  ADD COLUMN IF NOT EXISTS target_tss numeric,
  ADD COLUMN IF NOT EXISTS is_recovery boolean NOT NULL DEFAULT false;

-- expand sport + martial_arts in create_coach_training_program
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
  v_free_students boolean := false;
  v_free_members boolean := false;
  v_product_description text;
  v_thumbnail_url text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;

  IF v_distribution NOT IN ('free', 'subscribers', 'one_time', 'both') THEN
    RAISE EXCEPTION 'invalid_distribution';
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
  IF nullif(p_payload->>'isPublished', '') IS NOT NULL THEN
    IF lower(p_payload->>'isPublished') NOT IN ('true', 'false') THEN
      RAISE EXCEPTION 'invalid_published_flag';
    END IF;
    v_is_published := (p_payload->>'isPublished')::boolean;
  END IF;
  v_is_premium := v_distribution <> 'free';

  IF jsonb_typeof(coalesce(p_payload->'weeks', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_weeks';
  END IF;
  IF jsonb_typeof(coalesce(p_payload->'sessions', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_sessions';
  END IF;
  IF jsonb_typeof(coalesce(p_payload->'equipment', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_equipment';
  END IF;
  IF jsonb_typeof(v_product) <> 'object' THEN
    RAISE EXCEPTION 'invalid_product';
  END IF;

  v_week_count := jsonb_array_length(coalesce(p_payload->'weeks', '[]'::jsonb));
  v_session_count := jsonb_array_length(coalesce(p_payload->'sessions', '[]'::jsonb));

  IF v_sport NOT IN ('cycling','running','triathlon','crossfit','martial_arts') THEN
    RAISE EXCEPTION 'invalid_sport';
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

  IF nullif(v_product->>'enabled', '') IS NOT NULL THEN
    IF lower(v_product->>'enabled') NOT IN ('true', 'false') THEN
      RAISE EXCEPTION 'invalid_product_enabled';
    END IF;
    v_product_enabled := (v_product->>'enabled')::boolean;
  END IF;

  IF v_distribution IN ('one_time', 'both') AND v_product_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'product_required_for_distribution';
  END IF;
  IF v_distribution IN ('free', 'subscribers') AND v_product_enabled IS TRUE THEN
    RAISE EXCEPTION 'invalid_product_for_distribution';
  END IF;
  IF v_product_enabled AND v_is_published IS NOT TRUE THEN
    RAISE EXCEPTION 'product_requires_published_program';
  END IF;

  IF v_product_enabled THEN
    IF nullif(v_product->>'pricePublic', '') IS NULL OR (v_product->>'pricePublic') !~ '^\d+(\.\d{1,2})?$' THEN
      RAISE EXCEPTION 'invalid_product_price';
    END IF;
    v_price_public := (v_product->>'pricePublic')::numeric;
    IF v_price_public < 1 OR v_price_public > 999999 THEN
      RAISE EXCEPTION 'invalid_product_price';
    END IF;

    IF nullif(v_product->>'priceStudent', '') IS NOT NULL THEN
      IF (v_product->>'priceStudent') !~ '^\d+(\.\d{1,2})?$' THEN
        RAISE EXCEPTION 'invalid_student_price';
      END IF;
      v_price_student := (v_product->>'priceStudent')::numeric;
    END IF;
    IF nullif(v_product->>'priceMember', '') IS NOT NULL THEN
      IF (v_product->>'priceMember') !~ '^\d+(\.\d{1,2})?$' THEN
        RAISE EXCEPTION 'invalid_member_price';
      END IF;
      v_price_member := (v_product->>'priceMember')::numeric;
    END IF;
    IF v_price_student IS NOT NULL AND (v_price_student < 0 OR v_price_student > 999999) THEN
      RAISE EXCEPTION 'invalid_student_price';
    END IF;
    IF v_price_member IS NOT NULL AND (v_price_member < 0 OR v_price_member > 999999) THEN
      RAISE EXCEPTION 'invalid_member_price';
    END IF;

    v_free_students := coalesce((v_product->>'isFreeForStudents')::boolean, false);
    v_free_members := coalesce((v_product->>'isFreeForMembers')::boolean, false);
    v_product_description := nullif(trim(coalesce(v_product->>'description', '')), '');
    v_thumbnail_url := nullif(trim(coalesce(v_product->>'thumbnailUrl', '')), '');

    IF v_product_description IS NOT NULL AND length(v_product_description) > 500 THEN
      RAISE EXCEPTION 'invalid_product_description';
    END IF;
    IF v_thumbnail_url IS NOT NULL AND length(v_thumbnail_url) > 2048 THEN
      RAISE EXCEPTION 'invalid_product_thumbnail';
    END IF;
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
    v_uid, 50, jsonb_build_object('builder', 'coach_program_builder_v2', 'distribution', v_distribution)
  )
  RETURNING id INTO v_program_id;

  IF v_product_enabled THEN
    INSERT INTO public.products (
      tenant_id, creator_id, name, description, type, category, market_item_type, source_id,
      price, price_public, price_student, price_member,
      is_free_for_students, is_free_for_members, thumbnail_url, cover_image_url,
      is_published, is_recurring, active, access_mode
    )
    VALUES (
      v_uid, v_uid, v_name,
      coalesce(v_product_description, v_description, v_goal),
      'programa', 'digital', 'training_program', v_program_id,
      v_price_public, v_price_public,
      coalesce(v_price_student, v_price_public), coalesce(v_price_member, v_price_public),
      v_free_students, v_free_members,
      v_thumbnail_url, v_thumbnail_url,
      true, false, true, 'lifetime'
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

    INSERT INTO public.training_program_weeks
      (program_id, week, phase, target_minutes, target_tss, is_recovery, focus_i18n_key)
    VALUES (
      v_program_id,
      v_week_rec.week,
      v_week_rec.phase,
      v_week_rec."targetMinutes",
      v_week_rec."targetTss",
      coalesce(v_week_rec."isRecovery", false),
      NULL
    );
  END LOOP;

  FOR v_session_rec IN
    SELECT *
    FROM jsonb_to_recordset(p_payload->'sessions') AS x(
      week int, day int, position int, title text, description text,
      "sessionType" text, "estMinutes" int, target jsonb
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
      'skill','strength','metcon','emom','amrap','for_time','conditioning'
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
