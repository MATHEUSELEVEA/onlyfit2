-- workout_cycles_status_check allows only 'active' and 'archived', not 'completed'
-- clone_protocol_for_student used 'completed' when archiving old cycles -> use 'archived'
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protocol % not found', p_protocol_id;
  END IF;

  UPDATE public.workout_cycles
  SET status = 'archived', ends_at = CURRENT_DATE
  WHERE student_id = p_student_id
    AND coach_id = p_coach_id
    AND status = 'active';

  UPDATE public.student_workout_assignments
  SET status = 'archived'
  WHERE student_user_id = p_student_id
    AND source_id = p_coach_id
    AND status = 'active';

  INSERT INTO public.workout_cycles (
    coach_id, student_id, name, description,
    source_protocol_id, status, starts_at, duration_weeks
  ) VALUES (
    p_coach_id, p_student_id, v_protocol.name, v_protocol.description,
    p_protocol_id, 'active', CURRENT_DATE,
    COALESCE(v_protocol.auto_archive_after_weeks, 4)
  ) RETURNING id INTO v_new_cycle_id;

  FOR v_item IN
    SELECT w.*, pi.day_label, pi.day_code, pi.position AS item_position
    FROM public.workout_protocol_items pi
    JOIN public.workouts w ON pi.workout_template_id = w.id
    WHERE pi.protocol_id = p_protocol_id
    ORDER BY pi.position
  LOOP
    v_day_code := COALESCE(v_item.day_code, label_to_day_code(v_item.day_label));

    INSERT INTO public.workouts (
      title, description, owner_id, pro_id, tenant_id,
      workout_type, source_template_id, is_published,
      category, level, tags, coach_video_url
    ) VALUES (
      v_item.title, v_item.description, p_student_id, p_coach_id, v_item.tenant_id,
      'coach_individual', v_item.id, false,
      v_item.category, v_item.level, v_item.tags, v_item.coach_video_url
    ) RETURNING id INTO v_new_workout_id;

    INSERT INTO public.student_workout_assignments (
      student_user_id, workout_id, cycle_id,
      source_type, source_id, status,
      days_of_week, protocol_starts_at, starts_at, order_index
    ) VALUES (
      p_student_id, v_new_workout_id, v_new_cycle_id,
      'coach', p_coach_id, 'active',
      CASE WHEN v_day_code IS NOT NULL THEN ARRAY[v_day_code] ELSE '{}'::TEXT[] END,
      CURRENT_DATE, CURRENT_DATE, v_item.item_position
    );

    FOR v_exercise IN
      SELECT * FROM public.workout_exercises WHERE workout_id = v_item.id ORDER BY position
    LOOP
      INSERT INTO public.workout_exercises (
        workout_id, sets, reps, rest_seconds, cadence,
        notes, tempo_notes, position, ymove_exercise_id,
        super_set_id, load_meta_goal, rest_type, pro_video_url
      ) VALUES (
        v_new_workout_id, v_exercise.sets, v_exercise.reps, v_exercise.rest_seconds, v_exercise.cadence,
        v_exercise.notes, v_exercise.tempo_notes, v_exercise.position, v_exercise.ymove_exercise_id,
        v_exercise.super_set_id, v_exercise.load_meta_goal, v_exercise.rest_type, v_exercise.pro_video_url
      );
    END LOOP;
  END LOOP;

  RETURN v_new_cycle_id;
END;
$$;

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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protocol % not found', p_protocol_id;
  END IF;

  v_effective_start := COALESCE(p_starts_at, v_protocol.starts_at, CURRENT_DATE);
  v_duration_weeks := COALESCE(v_protocol.duration_weeks, v_protocol.auto_archive_after_weeks, 4);
  v_effective_end := COALESCE(p_ends_at, v_protocol.ends_at, v_effective_start + (v_duration_weeks * 7));

  UPDATE public.workout_cycles
  SET status = 'archived', ends_at = CURRENT_DATE
  WHERE student_id = p_student_id
    AND coach_id = p_coach_id
    AND status = 'active';

  UPDATE public.student_workout_assignments
  SET status = 'archived'
  WHERE student_user_id = p_student_id
    AND source_id = p_coach_id
    AND status = 'active';

  INSERT INTO public.workout_cycles (
    coach_id, student_id, name, description,
    source_protocol_id, status, starts_at, ends_at, duration_weeks
  ) VALUES (
    p_coach_id, p_student_id, v_protocol.name, v_protocol.description,
    p_protocol_id, 'active', v_effective_start, v_effective_end, v_duration_weeks
  ) RETURNING id INTO v_new_cycle_id;

  FOR v_item IN
    SELECT w.*, pi.day_label, pi.day_code, pi.position AS item_position
    FROM public.workout_protocol_items pi
    JOIN public.workouts w ON pi.workout_template_id = w.id
    WHERE pi.protocol_id = p_protocol_id
    ORDER BY pi.position
  LOOP
    v_day_code := COALESCE(v_item.day_code, label_to_day_code(v_item.day_label));

    INSERT INTO public.workouts (
      title, description, owner_id, pro_id, tenant_id,
      workout_type, source_template_id, is_published,
      category, level, tags, coach_video_url
    ) VALUES (
      v_item.title, v_item.description, p_student_id, p_coach_id, v_item.tenant_id,
      'coach_individual', v_item.id, false,
      v_item.category, v_item.level, v_item.tags, v_item.coach_video_url
    ) RETURNING id INTO v_new_workout_id;

    INSERT INTO public.student_workout_assignments (
      student_user_id, workout_id, cycle_id,
      source_type, source_id, status,
      days_of_week, protocol_starts_at, starts_at, order_index
    ) VALUES (
      p_student_id, v_new_workout_id, v_new_cycle_id,
      'coach', p_coach_id, 'active',
      CASE WHEN v_day_code IS NOT NULL THEN ARRAY[v_day_code] ELSE '{}'::TEXT[] END,
      v_effective_start, v_effective_start, v_item.item_position
    );

    FOR v_exercise IN
      SELECT * FROM public.workout_exercises WHERE workout_id = v_item.id ORDER BY position
    LOOP
      INSERT INTO public.workout_exercises (
        workout_id, sets, reps, rest_seconds, cadence,
        notes, tempo_notes, position, ymove_exercise_id,
        super_set_id, load_meta_goal, pro_video_url,
        exercise_name, muscle_group
      ) VALUES (
        v_new_workout_id, v_exercise.sets, v_exercise.reps,
        v_exercise.rest_seconds, v_exercise.cadence,
        v_exercise.notes, v_exercise.tempo_notes,
        v_exercise.position, v_exercise.ymove_exercise_id,
        v_exercise.super_set_id, v_exercise.load_meta_goal,
        v_exercise.pro_video_url,
        v_exercise.exercise_name, v_exercise.muscle_group
      );
    END LOOP;
  END LOOP;

  RETURN v_new_cycle_id;
END;
$$;
