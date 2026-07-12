-- Leaderboard semanal da comunidade (estilo clube Strava): ranking LOCAL por
-- esforço — nº de treinos concluídos nos últimos 7 dias — nunca global e nunca
-- por carga/resultado bruto (ver src/lib/sportEngagementConfig.ts).
--
-- SECURITY DEFINER porque workout_sessions de outros membros é bloqueado por
-- RLS para o viewer; a autorização é feita explicitamente dentro da função:
-- só membros da comunidade (community_members), assinantes ativos do creator
-- ou o próprio creator conseguem ler o ranking, e apenas agregados (contagem),
-- nunca as sessões em si.

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
  )
  select
    m.user_id,
    pf.username,
    pf.full_name,
    pf.avatar_url,
    count(ws.id)::bigint as workouts_count,
    max(ws.completed_at) as last_workout_at
  from members m
  join public.profiles pf on pf.id = m.user_id
  join public.workout_sessions ws
    on ws.student_id = m.user_id
   and ws.completed_at >= now() - interval '7 days'
  group by m.user_id, pf.username, pf.full_name, pf.avatar_url
  order by workouts_count desc, last_workout_at asc, pf.full_name asc nulls last
  limit greatest(1, least(coalesce(p_limit, 5), 25));
$$;

revoke execute on function public.get_community_weekly_leaderboard(uuid, int) from anon, public;
grant execute on function public.get_community_weekly_leaderboard(uuid, int) to authenticated;
