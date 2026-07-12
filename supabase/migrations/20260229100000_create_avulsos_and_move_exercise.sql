-- Create "Exercícios avulsos" workout + assignment when needed, then move exercise
-- Used when user drops exercise on a day cell (isolated, outside template)
create or replace function public.create_avulsos_and_move_exercise(
  p_student_id uuid,
  p_cycle_id uuid,
  p_day_code text,
  p_exercise_row_id uuid,
  p_coach_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avulsos_workout_id uuid;
  v_avulsos_assignment_id uuid;
  v_from_workout_id uuid;
  v_max_pos int;
  v_coach_ok boolean;
begin
  if auth.uid() is null or auth.uid() <> p_coach_id then
    raise exception 'unauthorized';
  end if;

  -- Coach must have active relationship with student
  select exists (
    select 1 from coach_relationships
    where student_id = p_student_id and coach_id = p_coach_id and status = 'active'
  ) into v_coach_ok;
  if not coalesce(v_coach_ok, false) then
    raise exception 'unauthorized';
  end if;

  -- Get source workout
  select workout_id into v_from_workout_id
  from workout_exercises where id = p_exercise_row_id;
  if v_from_workout_id is null then
    raise exception 'exercise_row_not_found';
  end if;

  -- Find existing "Exercícios avulsos" for this day
  select w.id into v_avulsos_workout_id
  from student_workout_assignments a
  join workouts w on w.id = a.workout_id
  where a.student_user_id = p_student_id
    and a.cycle_id = p_cycle_id
    and a.status = 'active'
    and w.title = 'Exercícios avulsos'
    and (a.days_of_week = array[p_day_code] or a.days_of_week @> array[p_day_code])
  limit 1;

  if v_avulsos_workout_id is null then
    -- Create workout
    insert into workouts (
      title, description, owner_id, pro_id, tenant_id, workout_type, source_id
    ) values (
      'Exercícios avulsos',
      null,
      p_coach_id,
      p_coach_id,
      p_student_id,
      'coach_individual',
      p_student_id
    )
    returning id into v_avulsos_workout_id;

    -- Create assignment
    insert into student_workout_assignments (
      student_user_id, workout_id, cycle_id, source_type, source_id,
      status, days_of_week, order_index
    )
    select
      p_student_id,
      v_avulsos_workout_id,
      p_cycle_id,
      'coach',
      p_coach_id,
      'active',
      array[p_day_code],
      coalesce((select max(order_index) from student_workout_assignments
               where student_user_id = p_student_id and cycle_id = p_cycle_id), -1) + 1
    returning id into v_avulsos_assignment_id;
  end if;

  -- Move exercise to avulsos workout
  select coalesce(max(position), 0) + 1 into v_max_pos
  from workout_exercises where workout_id = v_avulsos_workout_id;

  update workout_exercises
  set workout_id = v_avulsos_workout_id, position = v_max_pos
  where id = p_exercise_row_id;

  return v_avulsos_workout_id;
end;
$$;

revoke all on function public.create_avulsos_and_move_exercise(uuid, uuid, text, uuid, uuid) from public;
grant execute on function public.create_avulsos_and_move_exercise(uuid, uuid, text, uuid, uuid) to authenticated;
