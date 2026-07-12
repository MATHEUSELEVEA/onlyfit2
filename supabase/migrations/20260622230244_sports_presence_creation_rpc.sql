-- Sports presence creation: transactional organization creation + guarded publish.
-- Public RPCs are intentionally small, authenticated-only, validate every
-- client-provided field, and run as invoker so RLS remains the first guard.
-- A private SECURITY DEFINER helper creates the initial owner membership because
-- the organization_members policy intentionally prevents client-side owner role
-- assignment.

CREATE OR REPLACE FUNCTION private.add_organization_owner_member(
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = p_organization_id
      AND o.owner_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'organization_not_owned';
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (p_organization_id, p_user_id, 'owner', 'active')
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET role = 'owner', status = 'active';
END;
$function$;

CREATE OR REPLACE FUNCTION private.mark_sports_consultancy_profile(
  p_user_id uuid,
  p_subtype text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_types text[];
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT array_agg(DISTINCT professional_type ORDER BY professional_type)
    INTO v_types
  FROM (
    SELECT unnest(COALESCE(professional_types, ARRAY[]::text[])) AS professional_type
    FROM public.profiles
    WHERE id = p_user_id
    UNION ALL
    SELECT 'sports_consultancy'
    UNION ALL
    SELECT p_subtype
  ) AS merged
  WHERE professional_type IS NOT NULL
    AND professional_type <> '';

  UPDATE public.profiles
     SET professional_types = COALESCE(v_types, ARRAY['sports_consultancy']::text[]),
         account_kind = 'professional'
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_sports_consultancy(
  p_name text,
  p_slug text,
  p_subtype text,
  p_sports text[],
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_country text DEFAULT 'BR',
  p_service_mode text DEFAULT 'online',
  p_bio text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_cover_url text DEFAULT NULL,
  p_active_since date DEFAULT NULL
)
RETURNS public.organizations
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := NULLIF(trim(p_name), '');
  v_slug text := lower(NULLIF(trim(p_slug), ''));
  v_sports text[];
  v_row public.organizations;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_name IS NULL OR length(v_name) < 3 OR length(v_name) > 96 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$' THEN
    RAISE EXCEPTION 'invalid_slug';
  END IF;

  IF p_subtype NOT IN (
    'running_consultancy',
    'cycling_consultancy',
    'triathlon_consultancy',
    'multi_sport_consultancy'
  ) THEN
    RAISE EXCEPTION 'invalid_subtype';
  END IF;

  IF p_service_mode NOT IN ('online', 'in_person', 'hybrid') THEN
    RAISE EXCEPTION 'invalid_service_mode';
  END IF;

  SELECT array_agg(s ORDER BY ord)
    INTO v_sports
  FROM unnest(COALESCE(p_sports, ARRAY[]::text[])) WITH ORDINALITY AS x(s, ord)
  WHERE s IN ('cycling','martial_arts','bodybuilding','running','triathlon','crossfit');

  v_sports := COALESCE(v_sports, ARRAY[]::text[]);
  IF cardinality(v_sports) = 0 THEN
    RAISE EXCEPTION 'invalid_sports';
  END IF;

  INSERT INTO public.organizations (
    owner_id,
    name,
    slug,
    kind,
    subtype,
    sports,
    city,
    state,
    country,
    service_mode,
    bio,
    logo_url,
    cover_url,
    active_since,
    status
  )
  VALUES (
    v_uid,
    v_name,
    v_slug,
    'sports_consultancy',
    p_subtype,
    v_sports,
    NULLIF(trim(p_city), ''),
    upper(NULLIF(trim(p_state), '')),
    upper(COALESCE(NULLIF(trim(p_country), ''), 'BR')),
    p_service_mode,
    NULLIF(trim(p_bio), ''),
    NULLIF(trim(p_logo_url), ''),
    NULLIF(trim(p_cover_url), ''),
    p_active_since,
    'draft'
  )
  RETURNING * INTO v_row;

  PERFORM private.add_organization_owner_member(v_row.id, v_uid);
  PERFORM private.mark_sports_consultancy_profile(v_uid, p_subtype);

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.publish_sports_consultancy(p_organization_id uuid)
RETURNS public.organizations
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.organizations;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
    INTO v_row
  FROM public.organizations
  WHERE id = p_organization_id
    AND kind = 'sports_consultancy'
    AND owner_id = v_uid
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'organization_not_found';
  END IF;

  IF NULLIF(trim(v_row.name), '') IS NULL
    OR v_row.slug !~ '^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$'
    OR cardinality(v_row.sports) = 0
    OR v_row.subtype NOT IN (
      'running_consultancy',
      'cycling_consultancy',
      'triathlon_consultancy',
      'multi_sport_consultancy'
    )
    OR v_row.service_mode NOT IN ('online', 'in_person', 'hybrid')
    OR length(COALESCE(trim(v_row.bio), '')) < 24
  THEN
    RAISE EXCEPTION 'publish_requirements_missing';
  END IF;

  UPDATE public.organizations
     SET status = 'published',
         published_at = COALESCE(published_at, now()),
         updated_at = now()
   WHERE id = p_organization_id
     AND owner_id = v_uid
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_sports_consultancy(text, text, text, text[], text, text, text, text, text, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sports_consultancy(text, text, text, text[], text, text, text, text, text, text, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.publish_sports_consultancy(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_sports_consultancy(uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.add_organization_owner_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.add_organization_owner_member(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.mark_sports_consultancy_profile(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.mark_sports_consultancy_profile(uuid, text) TO authenticated;
