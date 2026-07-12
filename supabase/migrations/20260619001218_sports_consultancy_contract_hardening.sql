-- Hardening do marketplace de consultorias esportivas:
-- - endpoints públicos não precisam mais ser SECURITY DEFINER;
-- - contagem de alunos ativos fica agregada em tabela pública derivada;
-- - "minha consultoria" só é executável por usuário autenticado;
-- - policy de organization_places deixa de duplicar SELECT.

CREATE TABLE IF NOT EXISTS public.organization_public_stats (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  active_clients_count integer NOT NULL DEFAULT 0 CHECK (active_clients_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_public_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organization_public_stats_select_published" ON public.organization_public_stats;
CREATE POLICY "organization_public_stats_select_published" ON public.organization_public_stats
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = organization_id
        AND o.kind = 'sports_consultancy'
        AND o.status = 'published'
    )
  );

CREATE OR REPLACE FUNCTION private.refresh_organization_public_stats(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.organization_public_stats (
    organization_id,
    active_clients_count,
    updated_at
  )
  SELECT
    p_organization_id,
    count(*)::int,
    now()
  FROM public.organization_clients oc
  WHERE oc.organization_id = p_organization_id
    AND oc.status = 'active'
  ON CONFLICT (organization_id) DO UPDATE
  SET active_clients_count = EXCLUDED.active_clients_count,
      updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_organization_public_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM private.refresh_organization_public_stats(NEW.organization_id);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM private.refresh_organization_public_stats(OLD.organization_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS organization_clients_sync_public_stats ON public.organization_clients;
CREATE TRIGGER organization_clients_sync_public_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_clients
  FOR EACH ROW EXECUTE FUNCTION private.sync_organization_public_stats();

INSERT INTO public.organization_public_stats (
  organization_id,
  active_clients_count,
  updated_at
)
SELECT
  o.id,
  count(oc.user_id)::int,
  now()
FROM public.organizations o
LEFT JOIN public.organization_clients oc
  ON oc.organization_id = o.id
  AND oc.status = 'active'
WHERE o.kind = 'sports_consultancy'
GROUP BY o.id
ON CONFLICT (organization_id) DO UPDATE
SET active_clients_count = EXCLUDED.active_clients_count,
    updated_at = EXCLUDED.updated_at;

REVOKE ALL ON TABLE public.organization_public_stats FROM PUBLIC;
GRANT SELECT ON TABLE public.organization_public_stats TO anon, authenticated;
REVOKE ALL ON FUNCTION private.refresh_organization_public_stats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_organization_public_stats() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "organization_places_write_admin" ON public.organization_places;

DROP POLICY IF EXISTS "organization_places_insert_admin" ON public.organization_places;
CREATE POLICY "organization_places_insert_admin" ON public.organization_places
  FOR INSERT TO authenticated
  WITH CHECK (private.is_organization_admin(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS "organization_places_update_admin" ON public.organization_places;
CREATE POLICY "organization_places_update_admin" ON public.organization_places
  FOR UPDATE TO authenticated
  USING (private.is_organization_admin(organization_id, (select auth.uid())))
  WITH CHECK (private.is_organization_admin(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS "organization_places_delete_admin" ON public.organization_places;
CREATE POLICY "organization_places_delete_admin" ON public.organization_places
  FOR DELETE TO authenticated
  USING (private.is_organization_admin(organization_id, (select auth.uid())));

CREATE OR REPLACE FUNCTION public.get_sports_consultancies(
  p_sport text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_service_mode text DEFAULT NULL,
  p_verified_only boolean DEFAULT false
)
RETURNS TABLE (
  organization_id uuid,
  slug text,
  name text,
  logo_url text,
  cover_url text,
  sports text[],
  city text,
  state text,
  country text,
  service_mode text,
  verified boolean,
  active_since date,
  years_active integer,
  active_clients_count integer,
  starting_price numeric,
  plans_count integer,
  next_public_event_at timestamptz,
  objectives text[],
  is_user_client boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
  WITH base AS (
    SELECT o.*
    FROM public.organizations o
    WHERE o.kind = 'sports_consultancy'
      AND o.status = 'published'
      AND private.is_sports_consultancy_profile(o.owner_id, p_sport)
      AND (p_sport IS NULL OR p_sport = ANY(o.sports))
      AND (p_city IS NULL OR lower(coalesce(o.city, '')) LIKE '%' || lower(trim(p_city)) || '%')
      AND (p_state IS NULL OR lower(coalesce(o.state, '')) = lower(trim(p_state)))
      AND (p_service_mode IS NULL OR o.service_mode = p_service_mode)
      AND (coalesce(p_verified_only, false) = false OR o.verified = true)
      AND (
        p_search IS NULL
        OR lower(o.name) LIKE '%' || lower(trim(p_search)) || '%'
        OR lower(coalesce(o.bio, '')) LIKE '%' || lower(trim(p_search)) || '%'
      )
  )
  SELECT
    b.id,
    b.slug,
    b.name,
    b.logo_url,
    b.cover_url,
    b.sports,
    b.city,
    b.state,
    b.country,
    b.service_mode,
    b.verified,
    b.active_since,
    CASE
      WHEN b.active_since IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(YEAR FROM age(current_date, b.active_since))::int)
    END,
    coalesce(ops.active_clients_count, 0),
    (
      SELECT min(coalesce(p.price_public, p.price, 0))::numeric
      FROM public.products p
      WHERE (p.creator_id = b.owner_id OR p.tenant_id = b.owner_id)
        AND coalesce(p.active, true) = true
        AND coalesce(p.is_published, true) = true
        AND (p.type = 'subscription' OR p.market_item_type = 'consultoria')
    ),
    (
      SELECT count(*)::int
      FROM public.products p
      WHERE (p.creator_id = b.owner_id OR p.tenant_id = b.owner_id)
        AND coalesce(p.active, true) = true
        AND coalesce(p.is_published, true) = true
        AND (p.type = 'subscription' OR p.market_item_type = 'consultoria')
    ),
    (
      SELECT min(ev.starts_at)
      FROM public.organization_events ev
      WHERE ev.organization_id = b.id
        AND ev.status = 'published'
        AND ev.visibility = 'public'
        AND ev.starts_at >= now()
    ),
    CASE
      WHEN 'running' = ANY(b.sports) THEN ARRAY['first_5k','first_10k','half_marathon','marathon','performance','health']
      WHEN 'triathlon' = ANY(b.sports) THEN ARRAY['performance','health']
      WHEN 'cycling' = ANY(b.sports) THEN ARRAY['performance','health']
      ELSE ARRAY['performance','health']
    END,
    EXISTS (
      SELECT 1
      FROM public.organization_clients oc
      WHERE oc.organization_id = b.id
        AND oc.user_id = (select auth.uid())
        AND oc.status = 'active'
    )
  FROM base b
  LEFT JOIN public.organization_public_stats ops ON ops.organization_id = b.id
  ORDER BY b.verified DESC, coalesce(ops.active_clients_count, 0) DESC, b.published_at DESC NULLS LAST, b.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_my_sports_consultancy(p_sport text DEFAULT NULL)
RETURNS TABLE (
  organization_id uuid,
  slug text,
  name text,
  logo_url text,
  cover_url text,
  sports text[],
  city text,
  state text,
  country text,
  service_mode text,
  verified boolean,
  active_since date,
  client_active_since date,
  client_status text,
  coach_id uuid,
  coach_name text,
  coach_avatar_url text,
  next_event_at timestamptz,
  upcoming_events_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT
    o.id,
    o.slug,
    o.name,
    o.logo_url,
    o.cover_url,
    o.sports,
    o.city,
    o.state,
    o.country,
    o.service_mode,
    o.verified,
    o.active_since,
    oc.active_since,
    oc.status,
    oc.coach_id,
    pf.full_name,
    pf.avatar_url,
    (
      SELECT min(ev.starts_at)
      FROM public.organization_events ev
      WHERE ev.organization_id = o.id
        AND ev.status = 'published'
        AND ev.starts_at >= now()
        AND (
          ev.visibility = 'public'
          OR private.is_organization_client(o.id, (select auth.uid()))
          OR private.is_organization_member(o.id, (select auth.uid()))
        )
    ),
    (
      SELECT count(*)::int
      FROM public.organization_events ev
      WHERE ev.organization_id = o.id
        AND ev.status = 'published'
        AND ev.starts_at >= now()
        AND (
          ev.visibility = 'public'
          OR private.is_organization_client(o.id, (select auth.uid()))
          OR private.is_organization_member(o.id, (select auth.uid()))
        )
    )
  FROM public.organization_clients oc
  JOIN public.organizations o ON o.id = oc.organization_id
  LEFT JOIN public.profiles pf ON pf.id = oc.coach_id
  WHERE oc.user_id = (select auth.uid())
    AND oc.status IN ('active','pending_payment')
    AND o.kind = 'sports_consultancy'
    AND private.is_sports_consultancy_profile(o.owner_id, p_sport)
    AND (p_sport IS NULL OR p_sport = ANY(o.sports))
  ORDER BY (oc.status = 'active') DESC, oc.active_since DESC NULLS LAST, oc.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_consultancy_public(p_slug text)
RETURNS TABLE (
  organization_id uuid,
  owner_id uuid,
  owner_username text,
  slug text,
  name text,
  bio text,
  logo_url text,
  cover_url text,
  sports text[],
  city text,
  state text,
  country text,
  service_mode text,
  verified boolean,
  active_since date,
  years_active integer,
  active_clients_count integer,
  starting_price numeric,
  plans_count integer,
  objectives text[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT
    o.id,
    o.owner_id,
    pf.username,
    o.slug,
    o.name,
    o.bio,
    o.logo_url,
    o.cover_url,
    o.sports,
    o.city,
    o.state,
    o.country,
    o.service_mode,
    o.verified,
    o.active_since,
    CASE
      WHEN o.active_since IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(YEAR FROM age(current_date, o.active_since))::int)
    END,
    coalesce(ops.active_clients_count, 0),
    (
      SELECT min(coalesce(p.price_public, p.price, 0))::numeric
      FROM public.products p
      WHERE (p.creator_id = o.owner_id OR p.tenant_id = o.owner_id)
        AND coalesce(p.active, true) = true
        AND coalesce(p.is_published, true) = true
        AND (p.type = 'subscription' OR p.market_item_type = 'consultoria')
    ),
    (
      SELECT count(*)::int
      FROM public.products p
      WHERE (p.creator_id = o.owner_id OR p.tenant_id = o.owner_id)
        AND coalesce(p.active, true) = true
        AND coalesce(p.is_published, true) = true
        AND (p.type = 'subscription' OR p.market_item_type = 'consultoria')
    ),
    CASE
      WHEN 'running' = ANY(o.sports) THEN ARRAY['first_5k','first_10k','half_marathon','marathon','performance','health']
      WHEN 'triathlon' = ANY(o.sports) THEN ARRAY['performance','health']
      WHEN 'cycling' = ANY(o.sports) THEN ARRAY['performance','health']
      ELSE ARRAY['performance','health']
    END
  FROM public.organizations o
  LEFT JOIN public.profiles pf ON pf.id = o.owner_id
  LEFT JOIN public.organization_public_stats ops ON ops.organization_id = o.id
  WHERE o.slug = p_slug
    AND o.kind = 'sports_consultancy'
    AND o.status = 'published'
    AND private.is_sports_consultancy_profile(o.owner_id, NULL)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_sports_consultancies(text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sports_consultancies(text, text, text, text, text, boolean) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_my_sports_consultancy(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_sports_consultancy(text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_consultancy_public(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_consultancy_public(text) TO anon, authenticated;
