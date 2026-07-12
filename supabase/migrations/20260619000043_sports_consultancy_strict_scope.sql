-- Correção de escopo: marketplace de assessorias esportivas nao pode listar
-- qualquer creator/personal/nutri que tenha `sports` no perfil.
-- Só organizações com intenção explícita de assessoria esportiva ficam públicas.

CREATE OR REPLACE FUNCTION private.is_sports_consultancy_profile(p_user_id uuid, p_sport text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH profile AS (
    SELECT
      coalesce(onboarding_track, '') AS onboarding_track,
      coalesce(default_workspace, '') AS default_workspace,
      coalesce(professional_types, '{}') AS professional_types
    FROM public.profiles
    WHERE id = p_user_id
  ),
  types AS (
    SELECT lower(trim(value)) AS professional_type
    FROM profile, unnest(profile.professional_types) AS value
  )
  SELECT EXISTS (
    SELECT 1
    FROM profile
    WHERE onboarding_track = 'sports_consultancy'
       OR default_workspace = 'sports'
  )
  OR EXISTS (
    SELECT 1
    FROM types
    WHERE professional_type IN (
      'sports_consultancy',
      'sports_coach',
      'endurance_coach',
      'running_consultancy',
      'cycling_consultancy',
      'triathlon_consultancy',
      'running_coach',
      'cycling_coach',
      'triathlon_coach',
      'run_coach',
      'bike_coach',
      'martial_arts_coach',
      'combat_coach',
      'crossfit_coach'
    )
      AND (
        p_sport IS NULL
        OR professional_type IN ('sports_consultancy', 'sports_coach')
        OR (p_sport IN ('running','cycling','triathlon') AND professional_type = 'endurance_coach')
        OR (p_sport = 'running' AND professional_type IN ('running_consultancy','running_coach','run_coach'))
        OR (p_sport = 'cycling' AND professional_type IN ('cycling_consultancy','cycling_coach','bike_coach'))
        OR (p_sport = 'triathlon' AND professional_type IN ('triathlon_consultancy','triathlon_coach'))
        OR (p_sport = 'martial_arts' AND professional_type IN ('martial_arts_coach','combat_coach'))
        OR (p_sport = 'crossfit' AND professional_type = 'crossfit_coach')
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION private.is_sports_consultancy_profile(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION private.is_sports_consultancy_profile(uuid, text) TO anon, authenticated;

-- Recolhe as organizações que foram publicadas automaticamente por terem sports
-- em creator_profiles, mas cujo dono nao declarou assessoria esportiva.
UPDATE public.organizations o
SET status = 'draft',
    published_at = NULL,
    updated_at = now()
WHERE o.kind = 'sports_consultancy'
  AND o.status = 'published'
  AND NOT private.is_sports_consultancy_profile(o.owner_id, NULL);

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
SECURITY DEFINER
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
    b.id AS organization_id,
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
    END AS years_active,
    (
      SELECT count(*)::int
      FROM public.organization_clients oc
      WHERE oc.organization_id = b.id
        AND oc.status = 'active'
    ) AS active_clients_count,
    (
      SELECT min(coalesce(p.price_public, p.price, 0))::numeric
      FROM public.products p
      WHERE (p.creator_id = b.owner_id OR p.tenant_id = b.owner_id)
        AND coalesce(p.active, true) = true
        AND coalesce(p.is_published, true) = true
        AND (p.type = 'subscription' OR p.market_item_type = 'consultoria')
    ) AS starting_price,
    (
      SELECT count(*)::int
      FROM public.products p
      WHERE (p.creator_id = b.owner_id OR p.tenant_id = b.owner_id)
        AND coalesce(p.active, true) = true
        AND coalesce(p.is_published, true) = true
        AND (p.type = 'subscription' OR p.market_item_type = 'consultoria')
    ) AS plans_count,
    (
      SELECT min(ev.starts_at)
      FROM public.organization_events ev
      WHERE ev.organization_id = b.id
        AND ev.status = 'published'
        AND ev.visibility = 'public'
        AND ev.starts_at >= now()
    ) AS next_public_event_at,
    CASE
      WHEN 'running' = ANY(b.sports) THEN ARRAY['first_5k','first_10k','half_marathon','marathon','performance','health']
      WHEN 'triathlon' = ANY(b.sports) THEN ARRAY['performance','health']
      WHEN 'cycling' = ANY(b.sports) THEN ARRAY['performance','health']
      ELSE ARRAY['performance','health']
    END AS objectives,
    EXISTS (
      SELECT 1
      FROM public.organization_clients oc
      WHERE oc.organization_id = b.id
        AND oc.user_id = (select auth.uid())
        AND oc.status = 'active'
    ) AS is_user_client
  FROM base b
  ORDER BY b.verified DESC, active_clients_count DESC, b.published_at DESC NULLS LAST, b.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_sports_consultancies(text, text, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.get_sports_consultancies(text, text, text, text, text, boolean) TO anon, authenticated;

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
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    o.id AS organization_id,
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
    oc.active_since AS client_active_since,
    oc.status AS client_status,
    oc.coach_id,
    pf.full_name AS coach_name,
    pf.avatar_url AS coach_avatar_url,
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
    ) AS next_event_at,
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
    ) AS upcoming_events_count
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

REVOKE EXECUTE ON FUNCTION public.get_my_sports_consultancy(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_sports_consultancy(text) TO authenticated;

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
SECURITY DEFINER
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
    (
      SELECT count(*)::int FROM public.organization_clients oc
      WHERE oc.organization_id = o.id AND oc.status = 'active'
    ),
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
  WHERE o.slug = p_slug
    AND o.kind = 'sports_consultancy'
    AND o.status = 'published'
    AND private.is_sports_consultancy_profile(o.owner_id, NULL)
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_consultancy_public(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_consultancy_public(text) TO anon, authenticated;
