-- Fita de membros da comunidade (prova social estilo Strava no hero):
-- avatares + contagem total, visível só para quem pertence à comunidade.
--
-- SECURITY DEFINER porque profiles/memberships de terceiros podem ser
-- bloqueados por RLS para o viewer; a autorização é explícita dentro da
-- função (mesmo modelo de get_community_weekly_leaderboard): só membro,
-- assinante ativo do creator ou o próprio creator. Retorna apenas dados
-- de exibição pública do perfil (nome, username, avatar).

create or replace function public.get_community_member_faces(
  p_community_id uuid,
  p_limit int default 8
)
returns table (
  user_id uuid,
  username text,
  full_name text,
  avatar_url text,
  total_members bigint
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
  counted as (
    select count(*)::bigint as total from members
  )
  select
    m.user_id,
    pf.username,
    pf.full_name,
    pf.avatar_url,
    counted.total as total_members
  from members m
  join public.profiles pf on pf.id = m.user_id
  cross join counted
  -- Avatares primeiro: a fita é prova social visual.
  order by (pf.avatar_url is not null) desc, pf.full_name asc nulls last
  limit greatest(1, least(coalesce(p_limit, 8), 24));
$$;

revoke execute on function public.get_community_member_faces(uuid, int) from anon, public;
grant execute on function public.get_community_member_faces(uuid, int) to authenticated;
