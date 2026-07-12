-- Papéis, onboarding multi-atuação e negócios genéricos.
-- Reaproveita organizations como fonte única para academias, assessorias e marcas.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_default_workspace_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_default_workspace_check
  CHECK (default_workspace IS NULL OR default_workspace IN ('student','coach','nutrition','creator','sports','facility'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_onboarding_track_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_onboarding_track_check
  CHECK (onboarding_track IS NULL OR onboarding_track IN (
    'athlete',
    'personal_trainer',
    'nutritionist',
    'hybrid_professional',
    'creator',
    'sports_consultancy',
    'facility_owner',
    'brand_owner',
    'professional_athlete'
  ));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_kind_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_kind_check
  CHECK (kind IN ('facility','sports_consultancy','brand'));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_subtype_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_subtype_check
  CHECK (subtype IN (
    'gym','box','studio','fight_gym','run_club','club','clinic',
    'running_consultancy','cycling_consultancy','triathlon_consultancy','multi_sport_consultancy',
    'bodybuilding_consultancy','crossfit_consultancy','martial_arts_consultancy',
    'sportswear','supplements','equipment','wellness','events','other_brand'
  ));

CREATE TABLE IF NOT EXISTS public.organization_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created','published','status_changed','member_changed')),
  previous_status text,
  next_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_audit_log_org_created_idx
  ON public.organization_audit_log (organization_id, created_at DESC);

ALTER TABLE public.organization_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organization_audit_log_select_admin" ON public.organization_audit_log;
CREATE POLICY "organization_audit_log_select_admin" ON public.organization_audit_log
  FOR SELECT TO authenticated
  USING (private.is_organization_admin(organization_id, (select auth.uid())));

CREATE OR REPLACE FUNCTION private.organization_professional_type(p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE p_kind
    WHEN 'facility' THEN 'facility_owner'
    WHEN 'brand' THEN 'brand_owner'
    ELSE 'sports_consultancy'
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
  v_type text := private.organization_professional_type(p_kind);
  v_workspace text := CASE
    WHEN p_kind = 'facility' THEN 'facility'
    WHEN p_kind = 'sports_consultancy' THEN 'sports'
    ELSE 'creator'
  END;
  v_track text := CASE
    WHEN p_kind = 'facility' THEN 'facility_owner'
    WHEN p_kind = 'brand' THEN 'brand_owner'
    ELSE 'sports_consultancy'
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
    UNION ALL SELECT v_type
    UNION ALL SELECT p_subtype
  ) AS merged
  WHERE professional_type IS NOT NULL
    AND professional_type <> '';

  UPDATE public.profiles
     SET professional_types = COALESCE(v_types, ARRAY[v_type]::text[]),
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
  v_slug text := lower(NULLIF(trim(p_slug), ''));
  v_sports text[];
  v_row public.organizations;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_kind NOT IN ('facility','sports_consultancy','brand') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  IF v_name IS NULL OR length(v_name) < 3 OR length(v_name) > 96 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$' THEN
    RAISE EXCEPTION 'invalid_slug';
  END IF;

  IF p_service_mode NOT IN ('online', 'in_person', 'hybrid') THEN
    RAISE EXCEPTION 'invalid_service_mode';
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

  IF p_kind = 'brand' AND p_subtype NOT IN ('sportswear','supplements','equipment','wellness','events','other_brand') THEN
    RAISE EXCEPTION 'invalid_subtype';
  END IF;

  SELECT array_agg(s ORDER BY ord)
    INTO v_sports
  FROM unnest(COALESCE(p_sports, ARRAY[]::text[])) WITH ORDINALITY AS x(s, ord)
  WHERE s IN ('cycling','martial_arts','bodybuilding','running','triathlon','crossfit');

  v_sports := COALESCE(v_sports, ARRAY[]::text[]);
  IF p_kind <> 'brand' AND cardinality(v_sports) = 0 THEN
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
    OR (v_row.kind <> 'brand' AND cardinality(v_row.sports) = 0)
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
LANGUAGE sql
SET search_path TO 'public'
AS $$
  SELECT public.create_organization(
    'sports_consultancy',
    p_subtype,
    p_name,
    p_slug,
    p_sports,
    p_city,
    p_state,
    p_country,
    p_service_mode,
    p_bio,
    p_logo_url,
    p_cover_url,
    p_active_since
  );
$$;

CREATE OR REPLACE FUNCTION public.publish_sports_consultancy(p_organization_id uuid)
RETURNS public.organizations
LANGUAGE sql
SET search_path TO 'public'
AS $$
  SELECT public.publish_organization(p_organization_id);
$$;

WITH owner_types AS (
  SELECT
    o.owner_id,
    array_agg(DISTINCT private.organization_professional_type(o.kind)) AS organization_types
  FROM public.organizations o
  GROUP BY o.owner_id
),
merged AS (
  SELECT
    p.id,
    array_agg(DISTINCT value ORDER BY value) FILTER (WHERE value IS NOT NULL AND value <> '') AS professional_types
  FROM public.profiles p
  LEFT JOIN owner_types ot ON ot.owner_id = p.id
  LEFT JOIN LATERAL unnest(
    COALESCE(p.professional_types, ARRAY[]::text[])
    || COALESCE(ot.organization_types, ARRAY[]::text[])
    || CASE WHEN p.is_creator THEN ARRAY['creator']::text[] ELSE ARRAY[]::text[] END
  ) value ON true
  GROUP BY p.id
)
UPDATE public.profiles p
   SET professional_types = COALESCE(m.professional_types, ARRAY[]::text[]),
       account_kind = CASE
         WHEN cardinality(COALESCE(m.professional_types, ARRAY[]::text[])) > 0 THEN 'professional'
         ELSE p.account_kind
       END
FROM merged m
WHERE p.id = m.id;

REVOKE ALL ON FUNCTION public.create_organization(text, text, text, text, text[], text, text, text, text, text, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text, text, text, text[], text, text, text, text, text, text, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.publish_organization(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_organization(uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.mark_organization_owner_profile(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.mark_organization_owner_profile(uuid, text, text) TO authenticated;
