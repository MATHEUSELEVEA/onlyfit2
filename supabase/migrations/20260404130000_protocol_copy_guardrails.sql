-- Harden protocol copy/paste RPCs with explicit diagnostics.

CREATE OR REPLACE FUNCTION public.copy_protocol_week_v2(
  p_student_id uuid,
  p_cycle_id uuid,
  p_source_week integer,
  p_target_week integer,
  p_coach_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_src RECORD;
  v_next_order INT := 0;
  v_coach_ok BOOLEAN;
  v_cycle_ok BOOLEAN;
  v_new_workout_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_coach_id THEN
    RAISE EXCEPTION 'unauthorized'
      USING ERRCODE = '42501',
        DETAIL = 'auth_uid_mismatch',
        HINT = 'auth.uid must match p_coach_id';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.coach_relationships
    WHERE student_id = p_student_id
      AND coach_id = p_coach_id
      AND status IN ('active', 'pending_payment')
  ) INTO v_coach_ok;

  IF NOT COALESCE(v_coach_ok, FALSE) THEN
    RAISE EXCEPTION 'unauthorized'
      USING ERRCODE = '42501',
        DETAIL = 'relationship_not_found',
        HINT = 'coach_relationships missing or not active';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.workout_cycles
    WHERE id = p_cycle_id
      AND student_id = p_student_id
      AND coach_id = p_coach_id
  ) INTO v_cycle_ok;

  IF NOT COALESCE(v_cycle_ok, FALSE) THEN
    RAISE EXCEPTION 'cycle_scope_mismatch'
      USING ERRCODE = '22023',
        DETAIL = 'cycle_scope_mismatch',
        HINT = 'cycle does not belong to coach + student';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_workout_assignments a
    WHERE a.student_user_id = p_student_id
      AND a.cycle_id = p_cycle_id
      AND a.status = 'active'
      AND a.week_number = p_source_week
  ) THEN
    RAISE EXCEPTION 'source_week_empty'
      USING ERRCODE = '22023',
        DETAIL = 'source_week_empty',
        HINT = 'no active assignments for source week';
  END IF;

  DELETE FROM public.student_workout_assignments
  WHERE student_user_id = p_student_id
    AND cycle_id = p_cycle_id
    AND status = 'active'
    AND week_number = p_target_week;

  FOR v_src IN
    SELECT a.*
    FROM public.student_workout_assignments a
    WHERE a.student_user_id = p_student_id
      AND a.cycle_id = p_cycle_id
      AND a.status = 'active'
      AND a.week_number = p_source_week
    ORDER BY a.order_index NULLS LAST, a.id
  LOOP
    v_new_workout_id := public.clone_student_workout_instance(v_src.workout_id, p_student_id, p_coach_id);

    INSERT INTO public.student_workout_assignments (
      student_user_id,
      workout_id,
      cycle_id,
      source_type,
      source_id,
      status,
      days_of_week,
      protocol_starts_at,
      starts_at,
      order_index,
      week_number
    )
    VALUES (
      p_student_id,
      v_new_workout_id,
      p_cycle_id,
      'coach',
      p_coach_id,
      'active',
      COALESCE(v_src.days_of_week, '{}'),
      v_src.protocol_starts_at,
      COALESCE(v_src.starts_at, v_src.protocol_starts_at),
      v_next_order,
      p_target_week
    );

    v_next_order := v_next_order + 1;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.paste_protocol_cell_v2(
  p_student_id uuid,
  p_cycle_id uuid,
  p_source_week integer,
  p_source_day text,
  p_target_week integer,
  p_target_day text,
  p_coach_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coach_ok BOOLEAN;
  v_cycle_ok BOOLEAN;
  v_src RECORD;
  v_next_order INT;
  v_new_workout_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_coach_id THEN
    RAISE EXCEPTION 'unauthorized'
      USING ERRCODE = '42501',
        DETAIL = 'auth_uid_mismatch',
        HINT = 'auth.uid must match p_coach_id';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.coach_relationships
    WHERE student_id = p_student_id
      AND coach_id = p_coach_id
      AND status IN ('active', 'pending_payment')
  ) INTO v_coach_ok;

  IF NOT COALESCE(v_coach_ok, FALSE) THEN
    RAISE EXCEPTION 'unauthorized'
      USING ERRCODE = '42501',
        DETAIL = 'relationship_not_found',
        HINT = 'coach_relationships missing or not active';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.workout_cycles
    WHERE id = p_cycle_id
      AND student_id = p_student_id
      AND coach_id = p_coach_id
  ) INTO v_cycle_ok;

  IF NOT COALESCE(v_cycle_ok, FALSE) THEN
    RAISE EXCEPTION 'cycle_scope_mismatch'
      USING ERRCODE = '22023',
        DETAIL = 'cycle_scope_mismatch',
        HINT = 'cycle does not belong to coach + student';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_workout_assignments a
    WHERE a.student_user_id = p_student_id
      AND a.cycle_id = p_cycle_id
      AND a.status = 'active'
      AND a.week_number = p_source_week
      AND (a.days_of_week = ARRAY[p_source_day] OR a.days_of_week @> ARRAY[p_source_day])
  ) THEN
    RAISE EXCEPTION 'source_week_empty'
      USING ERRCODE = '22023',
        DETAIL = 'source_week_empty',
        HINT = 'no active assignments for source week/day';
  END IF;

  DELETE FROM public.student_workout_assignments a
  WHERE a.student_user_id = p_student_id
    AND a.cycle_id = p_cycle_id
    AND a.status = 'active'
    AND a.week_number = p_target_week
    AND (a.days_of_week = ARRAY[p_target_day] OR a.days_of_week @> ARRAY[p_target_day]);

  SELECT COALESCE(MAX(a.order_index), -1) + 1
  INTO v_next_order
  FROM public.student_workout_assignments a
  WHERE a.student_user_id = p_student_id
    AND a.cycle_id = p_cycle_id
    AND a.status = 'active'
    AND a.week_number = p_target_week;

  FOR v_src IN
    SELECT a.*
    FROM public.student_workout_assignments a
    WHERE a.student_user_id = p_student_id
      AND a.cycle_id = p_cycle_id
      AND a.status = 'active'
      AND a.week_number = p_source_week
      AND (a.days_of_week = ARRAY[p_source_day] OR a.days_of_week @> ARRAY[p_source_day])
    ORDER BY a.order_index NULLS LAST, a.id
  LOOP
    v_new_workout_id := public.clone_student_workout_instance(v_src.workout_id, p_student_id, p_coach_id);

    INSERT INTO public.student_workout_assignments (
      student_user_id,
      workout_id,
      cycle_id,
      source_type,
      source_id,
      status,
      days_of_week,
      protocol_starts_at,
      starts_at,
      order_index,
      week_number
    )
    VALUES (
      p_student_id,
      v_new_workout_id,
      p_cycle_id,
      'coach',
      p_coach_id,
      'active',
      ARRAY[p_target_day],
      v_src.protocol_starts_at,
      COALESCE(v_src.starts_at, v_src.protocol_starts_at),
      v_next_order,
      p_target_week
    );

    v_next_order := v_next_order + 1;
  END LOOP;
END;
$function$;
