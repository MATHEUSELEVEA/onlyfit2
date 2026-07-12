-- Enriquecimento do ranking semanal da comunidade.
--
-- Mantém a métrica universal de treinos concluídos e acrescenta métricas
-- públicas seguras para musculação quando existirem dados:
-- - calorias registradas pelo aluno ao finalizar o treino;
-- - volume total (kg x reps) a partir dos logs de séries;
-- - PRs pessoais por exercício, comparando a melhor carga da semana contra
--   o melhor histórico anterior do próprio aluno no mesmo movimento.
--
-- Não ranqueia carga absoluta entre pessoas como métrica principal.

drop function if exists public.get_community_weekly_leaderboard(uuid, int);

create or replace function public.get_community_weekly_leaderboard(
  p_community_id uuid,
  p_limit int default 5
)
returns table (
  user_id uuid,
  username text,
  full_name text,
  avatar_url text,
  workouts_count bigint,
  last_workout_at timestamptz,
  calories_logged bigint,
  total_volume_kg numeric,
  personal_prs_count bigint
)
language sql
security definer
stable
set search_path to 'public'
as $$
  with viewer as (
    select auth.uid() as uid
  ),
  target as (
    select c.id, c.creator_id
    from public.communities c
    join viewer v on true
    where c.id = p_community_id
      and v.uid is not null
      and (
        c.creator_id = v.uid
        or exists (
          select 1 from public.community_members cm
          where cm.community_id = c.id and cm.user_id = v.uid
        )
        or exists (
          select 1 from public.subscriptions s
          where s.creator_id = c.creator_id
            and s.subscriber_id = v.uid
            and s.status = 'active'
        )
      )
  ),
  members as (
    select cm.user_id
    from public.community_members cm
    join target tg on tg.id = cm.community_id
    union
    select s.subscriber_id
    from public.subscriptions s
    join target tg on tg.creator_id = s.creator_id
    where s.status = 'active' and s.subscriber_id is not null
    union
    select tg.creator_id from target tg
  ),
  sessions as (
    select ws.student_id as user_id, ws.completed_at
    from public.workout_sessions ws
    join members m on m.user_id = ws.student_id
    where ws.completed_at >= now() - interval '7 days'
    union all
    select tpe.user_id, psr.completed_at
    from public.program_session_results psr
    join public.training_program_enrollments tpe on tpe.id = psr.enrollment_id
    join members m on m.user_id = tpe.user_id
    where psr.completed_at >= now() - interval '7 days'
  ),
  workout_session_metrics as (
    select
      ws.student_id as user_id,
      coalesce(sum(ws.calories_logged), 0)::bigint as calories_logged
    from public.workout_sessions ws
    join members m on m.user_id = ws.student_id
    where ws.completed_at >= now() - interval '7 days'
    group by ws.student_id
  ),
  weekly_logs as (
    select
      wl.student_id as user_id,
      coalesce(wl.exercise_id::text, wl.workout_exercise_id::text) as movement_key,
      wl.weight_kg,
      wl.reps
    from public.workout_logs wl
    join public.workout_sessions ws on ws.id = wl.workout_session_id
    join members m on m.user_id = wl.student_id
    where ws.completed_at >= now() - interval '7 days'
      and wl.weight_kg is not null
      and wl.weight_kg > 0
  ),
  previous_best as (
    select
      wl.student_id as user_id,
      coalesce(wl.exercise_id::text, wl.workout_exercise_id::text) as movement_key,
      max(wl.weight_kg) as best_weight_kg
    from public.workout_logs wl
    join public.workout_sessions ws on ws.id = wl.workout_session_id
    join members m on m.user_id = wl.student_id
    where ws.completed_at < now() - interval '7 days'
      and wl.weight_kg is not null
      and wl.weight_kg > 0
    group by wl.student_id, coalesce(wl.exercise_id::text, wl.workout_exercise_id::text)
  ),
  workout_log_metrics as (
    select
      wl.user_id,
      coalesce(sum(wl.weight_kg * coalesce(wl.reps, 0)), 0)::numeric as total_volume_kg,
      count(distinct wl.movement_key) filter (
        where wl.weight_kg > coalesce(pb.best_weight_kg, 0)
      )::bigint as personal_prs_count
    from weekly_logs wl
    left join previous_best pb on pb.user_id = wl.user_id and pb.movement_key = wl.movement_key
    group by wl.user_id
  )
  select
    m.user_id,
    pf.username,
    pf.full_name,
    pf.avatar_url,
    count(s.completed_at)::bigint as workouts_count,
    max(s.completed_at) as last_workout_at,
    coalesce(max(wsm.calories_logged), 0)::bigint as calories_logged,
    coalesce(max(wlm.total_volume_kg), 0)::numeric as total_volume_kg,
    coalesce(max(wlm.personal_prs_count), 0)::bigint as personal_prs_count
  from members m
  join public.profiles pf on pf.id = m.user_id
  join sessions s on s.user_id = m.user_id
  left join workout_session_metrics wsm on wsm.user_id = m.user_id
  left join workout_log_metrics wlm on wlm.user_id = m.user_id
  group by m.user_id, pf.username, pf.full_name, pf.avatar_url
  order by workouts_count desc, last_workout_at asc, pf.full_name asc nulls last
  limit greatest(1, least(coalesce(p_limit, 5), 25));
$$;

revoke execute on function public.get_community_weekly_leaderboard(uuid, int) from anon, public;
grant execute on function public.get_community_weekly_leaderboard(uuid, int) to authenticated;
