-- Move workout exercise row to another workout (PULSE Canvas: drag exercise to another day)
create or replace function public.move_workout_exercise_row(
  p_exercise_row_id uuid,
  p_to_workout_id uuid,
  p_to_position int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_workout_id uuid;
  v_max_pos int;
begin
  select workout_id into v_from_workout_id
  from workout_exercises
  where id = p_exercise_row_id;

  if v_from_workout_id is null then
    raise exception 'exercise_row_not_found';
  end if;

  if p_to_position is null then
    select coalesce(max(position), 0) + 1 into v_max_pos
    from workout_exercises
    where workout_id = p_to_workout_id;
    p_to_position := v_max_pos;
  end if;

  update workout_exercises
  set workout_id = p_to_workout_id,
      position = p_to_position
  where id = p_exercise_row_id;
end;
$$;

revoke all on function public.move_workout_exercise_row(uuid, uuid, int) from public;
grant execute on function public.move_workout_exercise_row(uuid, uuid, int) to authenticated;
