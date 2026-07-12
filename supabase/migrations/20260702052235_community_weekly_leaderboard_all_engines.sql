-- Corrige subcontagem por esporte no ranking semanal da comunidade:
-- só musculação grava em workout_sessions; os motores de esporte (corrida,
-- ciclismo, triathlon, natação, crossfit, lutas) gravam conclusões em
-- program_session_results (via training_program_enrollments.user_id).
-- O ranking agora une as DUAS fontes — 100% dos motores contam.

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
  last_workout_at timestamptz
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
  -- Todas as fontes de treino concluído, qualquer motor/esporte.
  sessions as (
    select ws.student_id as user_id, ws.completed_at
    from public.workout_sessions ws
    where ws.completed_at >= now() - interval '7 days'
    union all
    select tpe.user_id, psr.completed_at
    from public.program_session_results psr
    join public.training_program_enrollments tpe on tpe.id = psr.enrollment_id
    where psr.completed_at >= now() - interval '7 days'
  )
  select
    m.user_id,
    pf.username,
    pf.full_name,
    pf.avatar_url,
    count(s.completed_at)::bigint as workouts_count,
    max(s.completed_at) as last_workout_at
  from members m
  join public.profiles pf on pf.id = m.user_id
  join sessions s on s.user_id = m.user_id
  group by m.user_id, pf.username, pf.full_name, pf.avatar_url
  order by workouts_count desc, last_workout_at asc, pf.full_name asc nulls last
  limit greatest(1, least(coalesce(p_limit, 5), 25));
$$;

revoke execute on function public.get_community_weekly_leaderboard(uuid, int) from anon, public;
grant execute on function public.get_community_weekly_leaderboard(uuid, int) to authenticated;

-- Contagem semanal do próprio usuário (card "Semana" do painel da comunidade),
-- mesma definição de treino do ranking. SECURITY INVOKER: a RLS já permite
-- ler as próprias linhas nas duas tabelas.
create or replace function public.get_my_weekly_workouts()
returns bigint
language sql
security invoker
stable
set search_path to 'public'
as $$
  select
    (
      select count(*)
      from public.workout_sessions ws
      where ws.student_id = (select auth.uid())
        and ws.completed_at >= now() - interval '7 days'
    )
    +
    (
      select count(*)
      from public.program_session_results psr
      join public.training_program_enrollments tpe on tpe.id = psr.enrollment_id
      where tpe.user_id = (select auth.uid())
        and psr.completed_at >= now() - interval '7 days'
    );
$$;

revoke execute on function public.get_my_weekly_workouts() from anon, public;
grant execute on function public.get_my_weekly_workouts() to authenticated;
