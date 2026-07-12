-- Adds Content Creator as a first-class business line in Gestão.
-- It is intentionally separate from brand/store: creator sells expertise,
-- protocols and content; brand/store sells products.

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_kind_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_kind_check
  CHECK (kind IN ('professional_consultancy','sports_consultancy','content_creator','brand','facility'));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_subtype_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_subtype_check
  CHECK (subtype IN (
    'fitness_consultancy','nutrition_consultancy','hybrid_consultancy',
    'running_consultancy','cycling_consultancy','triathlon_consultancy','multi_sport_consultancy',
    'bodybuilding_consultancy','crossfit_consultancy','martial_arts_consultancy',
    'content_creator',
    'sportswear','supplements','equipment','wellness','events','other_brand',
    'gym','box','studio','fight_gym','run_club','club','clinic'
  ));

CREATE OR REPLACE FUNCTION private.organization_professional_type(p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE p_kind
    WHEN 'facility' THEN 'facility_owner'
    WHEN 'brand' THEN 'brand_owner'
    WHEN 'content_creator' THEN 'creator'
    WHEN 'sports_consultancy' THEN 'sports_consultancy'
    ELSE 'personal_trainer'
  END;
$$;

CREATE OR REPLACE FUNCTION private.mark_organization_owner_profile(
  p_user_id uuid,
  p_kind text,
  p_subtype text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_workspace text := CASE
    WHEN p_kind = 'facility' THEN 'facility'
    WHEN p_kind = 'sports_consultancy' THEN 'sports'
    WHEN p_kind IN ('brand','content_creator') THEN 'creator'
    WHEN p_subtype = 'nutrition_consultancy' THEN 'nutrition'
    ELSE 'coach'
  END;
  v_track text := CASE
    WHEN p_kind = 'facility' THEN 'facility_owner'
    WHEN p_kind = 'brand' THEN 'brand_owner'
    WHEN p_kind = 'content_creator' THEN 'creator'
    WHEN p_kind = 'sports_consultancy' THEN 'sports_consultancy'
    WHEN p_subtype = 'nutrition_consultancy' THEN 'nutritionist'
    WHEN p_subtype = 'hybrid_consultancy' THEN 'hybrid_professional'
    ELSE 'personal_trainer'
  END;
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
    UNION ALL SELECT private.organization_professional_type(p_kind)
    UNION ALL SELECT CASE WHEN p_subtype IN ('nutrition_consultancy','hybrid_consultancy') THEN 'nutritionist' END
    UNION ALL SELECT CASE WHEN p_subtype IN ('fitness_consultancy','hybrid_consultancy') THEN 'personal_trainer' END
    UNION ALL SELECT p_subtype
  ) AS merged
  WHERE professional_type IS NOT NULL
    AND professional_type <> '';

  UPDATE public.profiles
     SET professional_types = COALESCE(v_types, ARRAY[private.organization_professional_type(p_kind)]::text[]),
         account_kind = 'professional',
         default_workspace = COALESCE(NULLIF(default_workspace, 'student'), v_workspace),
         onboarding_track = COALESCE(NULLIF(onboarding_track, 'athlete'), v_track)
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_organization(
  p_kind text,
  p_subtype text,
  p_name text,
  p_slug text,
  p_sports text[] DEFAULT ARRAY[]::text[],
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
  v_slug_input text;
  v_slug_base text;
  v_slug text;
  v_suffix text;
  v_attempt integer := 1;
  v_sports text[];
  v_row public.organizations;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_kind NOT IN ('professional_consultancy','sports_consultancy','content_creator','brand','facility') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  IF v_name IS NULL OR length(v_name) < 3 OR length(v_name) > 96 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  v_slug_input := lower(COALESCE(NULLIF(trim(p_slug), ''), v_name));
  v_slug_base := regexp_replace(
    translate(
      v_slug_input,
      'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    ),
    '[^a-z0-9]+',
    '-',
    'g'
  );
  v_slug_base := left(trim(both '-' from regexp_replace(v_slug_base, '-{2,}', '-', 'g')), 63);

  IF v_slug_base IS NULL OR v_slug_base !~ '^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$' THEN
    RAISE EXCEPTION 'invalid_slug';
  END IF;

  v_slug := v_slug_base;
  WHILE EXISTS (SELECT 1 FROM public.organizations o WHERE o.slug = v_slug) LOOP
    v_attempt := v_attempt + 1;
    v_suffix := '-' || v_attempt::text;
    v_slug := left(v_slug_base, 63 - length(v_suffix)) || v_suffix;
  END LOOP;

  IF p_service_mode NOT IN ('online', 'in_person', 'hybrid') THEN
    RAISE EXCEPTION 'invalid_service_mode';
  END IF;

  IF p_kind = 'professional_consultancy' AND p_subtype NOT IN ('fitness_consultancy','nutrition_consultancy','hybrid_consultancy') THEN
    RAISE EXCEPTION 'invalid_subtype';
  END IF;

  IF p_kind = 'facility' AND p_subtype NOT IN ('gym','box','studio','fight_gym','run_club','club','clinic') THEN
    RAISE EXCEPTION 'invalid_subtype';
  END IF;

  IF p_kind = 'sports_consultancy' AND p_subtype NOT IN (
    'running_consultancy','cycling_consultancy','triathlon_consultancy','multi_sport_consultancy',
    'bodybuilding_consultancy','crossfit_consultancy','martial_arts_consultancy'
  ) THEN
    RAISE EXCEPTION 'invalid_subtype';
  END IF;

  IF p_kind = 'content_creator' AND p_subtype <> 'content_creator' THEN
    RAISE EXCEPTION 'invalid_subtype';
  END IF;

  IF p_kind = 'brand' AND p_subtype NOT IN ('sportswear','supplements','equipment','wellness','events','other_brand') THEN
    RAISE EXCEPTION 'invalid_subtype';
  END IF;

  SELECT array_agg(s ORDER BY ord)
    INTO v_sports
  FROM unnest(COALESCE(p_sports, ARRAY[]::text[])) WITH ORDINALITY AS x(s, ord)
  WHERE s IN ('cycling','martial_arts','bodybuilding','running','triathlon','crossfit','swimming');

  v_sports := COALESCE(v_sports, ARRAY[]::text[]);
  IF p_kind IN ('sports_consultancy','facility','content_creator') AND cardinality(v_sports) = 0 THEN
    RAISE EXCEPTION 'invalid_sports';
  END IF;

  INSERT INTO public.organizations (
    owner_id, name, slug, kind, subtype, sports, city, state, country, service_mode,
    bio, logo_url, cover_url, active_since, status
  )
  VALUES (
    v_uid,
    v_name,
    v_slug,
    p_kind,
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
  PERFORM private.mark_organization_owner_profile(v_uid, p_kind, p_subtype);

  INSERT INTO public.organization_audit_log (organization_id, actor_id, action, next_status, metadata)
  VALUES (v_row.id, v_uid, 'created', v_row.status, jsonb_build_object('kind', p_kind, 'subtype', p_subtype));

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.publish_organization(p_organization_id uuid)
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
    AND (owner_id = v_uid OR private.is_organization_admin(id, v_uid))
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'organization_not_found';
  END IF;

  IF NULLIF(trim(v_row.name), '') IS NULL
    OR v_row.slug !~ '^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$'
    OR v_row.service_mode NOT IN ('online', 'in_person', 'hybrid')
    OR length(COALESCE(trim(v_row.bio), '')) < 12
    OR (v_row.kind IN ('sports_consultancy','facility','content_creator') AND cardinality(v_row.sports) = 0)
  THEN
    RAISE EXCEPTION 'publish_requirements_missing';
  END IF;

  UPDATE public.organizations
     SET status = 'published',
         published_at = COALESCE(published_at, now()),
         updated_at = now()
   WHERE id = p_organization_id
  RETURNING * INTO v_row;

  INSERT INTO public.organization_audit_log (organization_id, actor_id, action, previous_status, next_status)
  VALUES (v_row.id, v_uid, 'published', 'draft', v_row.status);

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_organization(text, text, text, text, text[], text, text, text, text, text, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text, text, text, text[], text, text, text, text, text, text, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.publish_organization(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_organization(uuid) TO authenticated;
