-- Comunidades passam a pertencer a um NEGÓCIO (organization), não só a um
-- perfil. Decisão de produto (jul/2026): tudo é criado por um negócio —
-- academia/box/arena (facility), assessoria, consultoria, creator — para
-- permitir organização multi-membro no futuro. creator_id permanece como o
-- perfil operador (dono) durante a transição.

-- 1) Coluna + índice. Grants explícitos por coluna: já houve SEV1 nesse banco
--    com coluna nova sem GRANT (ver profiles) — não confiar só no grant de tabela.
alter table public.communities
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

create index if not exists idx_communities_organization
  on public.communities (organization_id);

grant select (organization_id) on table public.communities to anon, authenticated;
grant update (organization_id) on table public.communities to authenticated;

-- 2) Backfill: cada comunidade liga ao negócio principal do creator
--    (publicado primeiro, depois o mais antigo). Creator sem negócio fica
--    null e é vinculado quando o negócio nascer (ver função abaixo).
update public.communities c
set organization_id = (
  select o.id
  from public.organizations o
  where o.owner_id = c.creator_id
  order by (o.status = 'published') desc, o.created_at asc
  limit 1
)
where c.organization_id is null;

-- 3) A auto-criação de comunidade agora nasce vinculada ao negócio principal
--    do creator, e repara vínculos nulos de comunidades já existentes.
create or replace function public._ensure_community_for_creator_internal(p_creator_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
DECLARE
  v_id uuid;
  v_name text;
  v_org uuid;
BEGIN
  IF p_creator_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT o.id INTO v_org
  FROM public.organizations o
  WHERE o.owner_id = p_creator_id
  ORDER BY (o.status = 'published') DESC, o.created_at ASC
  LIMIT 1;

  SELECT c.id INTO v_id FROM public.communities c WHERE c.creator_id = p_creator_id LIMIT 1;
  IF FOUND THEN
    -- Repara o vínculo com o negócio se ainda não existir.
    IF v_org IS NOT NULL THEN
      UPDATE public.communities
      SET organization_id = v_org
      WHERE id = v_id AND organization_id IS NULL;
    END IF;
    RETURN v_id;
  END IF;

  SELECT p.full_name INTO v_name FROM public.profiles p WHERE p.id = p_creator_id;

  BEGIN
    INSERT INTO public.communities (creator_id, organization_id, name, description, members_can_post)
    VALUES (
      p_creator_id,
      v_org,
      COALESCE(NULLIF(TRIM(v_name), ''), 'Comunidade'),
      NULL,
      true
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT c.id INTO v_id FROM public.communities c WHERE c.creator_id = p_creator_id LIMIT 1;
  END;

  RETURN v_id;
END;
$$;

-- 4) Descoberta agora expõe a identidade do NEGÓCIO (nome/logo/tipo/cidade)
--    além do creator. Retorno muda de shape → drop + create.
drop function if exists public.discover_communities_by_sport(text);

create function public.discover_communities_by_sport(p_sport text)
returns table(
  id uuid,
  name text,
  description text,
  member_count integer,
  sports text[],
  creator_id uuid,
  creator_username text,
  creator_full_name text,
  creator_avatar_url text,
  organization_id uuid,
  organization_name text,
  organization_logo_url text,
  organization_kind text,
  organization_city text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  SELECT c.id, c.name, c.description, c.member_count, c.sports,
         c.creator_id, pf.username, pf.full_name, pf.avatar_url,
         o.id, o.name, o.logo_url, o.kind, o.city
  FROM public.communities c
  JOIN public.profiles pf ON pf.id = c.creator_id
  LEFT JOIN public.organizations o ON o.id = c.organization_id
  WHERE p_sport = ANY (c.sports)
  ORDER BY c.member_count DESC NULLS LAST
  LIMIT 12;
$$;

revoke execute on function public.discover_communities_by_sport(text) from anon, public;
grant execute on function public.discover_communities_by_sport(text) to authenticated;
