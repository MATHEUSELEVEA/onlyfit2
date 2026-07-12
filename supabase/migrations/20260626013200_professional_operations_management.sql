-- Gestão: linhas de negócio profissionais, ofertas e turmas/ciclos.
-- Mantém organizations como fonte única e adiciona consultorias individuais.

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_kind_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_kind_check
  CHECK (kind IN ('professional_consultancy','sports_consultancy','brand','facility'));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_subtype_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_subtype_check
  CHECK (subtype IN (
    'fitness_consultancy','nutrition_consultancy','hybrid_consultancy',
    'running_consultancy','cycling_consultancy','triathlon_consultancy','multi_sport_consultancy',
    'bodybuilding_consultancy','crossfit_consultancy','martial_arts_consultancy',
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
    WHEN p_kind = 'brand' THEN 'creator'
    WHEN p_subtype = 'nutrition_consultancy' THEN 'nutrition'
    ELSE 'coach'
  END;
  v_track text := CASE
    WHEN p_kind = 'facility' THEN 'facility_owner'
    WHEN p_kind = 'brand' THEN 'brand_owner'
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
  v_slug text := lower(NULLIF(trim(p_slug), ''));
  v_sports text[];
  v_row public.organizations;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_kind NOT IN ('professional_consultancy','sports_consultancy','brand','facility') THEN
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

  IF p_kind = 'brand' AND p_subtype NOT IN ('sportswear','supplements','equipment','wellness','events','other_brand') THEN
    RAISE EXCEPTION 'invalid_subtype';
  END IF;

  SELECT array_agg(s ORDER BY ord)
    INTO v_sports
  FROM unnest(COALESCE(p_sports, ARRAY[]::text[])) WITH ORDINALITY AS x(s, ord)
  WHERE s IN ('cycling','martial_arts','bodybuilding','running','triathlon','crossfit','swimming');

  v_sports := COALESCE(v_sports, ARRAY[]::text[]);
  IF p_kind IN ('sports_consultancy','facility') AND cardinality(v_sports) = 0 THEN
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
    OR (v_row.kind IN ('sports_consultancy','facility') AND cardinality(v_row.sports) = 0)
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

CREATE TABLE IF NOT EXISTS public.operation_offers ( -- ENABLE ROW LEVEL SECURITY below
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'subscription' CHECK (kind IN ('subscription','package','one_time','custom')),
  tier text NOT NULL DEFAULT 'base' CHECK (tier IN ('base','plus','premium','custom')),
  price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),
  currency text NOT NULL DEFAULT 'BRL',
  billing_interval text CHECK (billing_interval IS NULL OR billing_interval IN ('once','month','2month','quarter','semester','year')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operation_offers_org_status_idx
  ON public.operation_offers (organization_id, status);

CREATE TABLE IF NOT EXISTS public.operation_cohorts ( -- ENABLE ROW LEVEL SECURITY below
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES public.operation_offers(id) ON DELETE SET NULL,
  name text NOT NULL,
  sport text,
  level text CHECK (level IS NULL OR level IN ('beginner','intermediate','advanced','elite','mixed')),
  starts_on date,
  ends_on date,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','completed','archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operation_cohorts_dates_check CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS operation_cohorts_org_status_idx
  ON public.operation_cohorts (organization_id, status);
CREATE INDEX IF NOT EXISTS operation_cohorts_offer_idx
  ON public.operation_cohorts (offer_id)
  WHERE offer_id IS NOT NULL;

ALTER TABLE public.operation_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_cohorts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operation_offers_select_staff" ON public.operation_offers;
CREATE POLICY "operation_offers_select_staff" ON public.operation_offers
  FOR SELECT TO authenticated
  USING (private.is_organization_staff(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS "operation_offers_insert_admin" ON public.operation_offers;
CREATE POLICY "operation_offers_insert_admin" ON public.operation_offers
  FOR INSERT TO authenticated
  WITH CHECK (private.is_organization_admin(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS "operation_offers_update_admin" ON public.operation_offers;
CREATE POLICY "operation_offers_update_admin" ON public.operation_offers
  FOR UPDATE TO authenticated
  USING (private.is_organization_admin(organization_id, (select auth.uid())))
  WITH CHECK (private.is_organization_admin(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS "operation_offers_delete_admin" ON public.operation_offers;
CREATE POLICY "operation_offers_delete_admin" ON public.operation_offers
  FOR DELETE TO authenticated
  USING (private.is_organization_admin(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS "operation_cohorts_select_staff" ON public.operation_cohorts;
CREATE POLICY "operation_cohorts_select_staff" ON public.operation_cohorts
  FOR SELECT TO authenticated
  USING (private.is_organization_staff(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS "operation_cohorts_insert_admin" ON public.operation_cohorts;
CREATE POLICY "operation_cohorts_insert_admin" ON public.operation_cohorts
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_organization_admin(organization_id, (select auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = organization_id
        AND o.kind IN ('sports_consultancy','facility')
    )
    AND (
      offer_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.operation_offers oo
        WHERE oo.id = offer_id
          AND oo.organization_id = operation_cohorts.organization_id
      )
    )
  );

DROP POLICY IF EXISTS "operation_cohorts_update_admin" ON public.operation_cohorts;
CREATE POLICY "operation_cohorts_update_admin" ON public.operation_cohorts
  FOR UPDATE TO authenticated
  USING (private.is_organization_admin(organization_id, (select auth.uid())))
  WITH CHECK (
    private.is_organization_admin(organization_id, (select auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = organization_id
        AND o.kind IN ('sports_consultancy','facility')
    )
    AND (
      offer_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.operation_offers oo
        WHERE oo.id = offer_id
          AND oo.organization_id = operation_cohorts.organization_id
      )
    )
  );

DROP POLICY IF EXISTS "operation_cohorts_delete_admin" ON public.operation_cohorts;
CREATE POLICY "operation_cohorts_delete_admin" ON public.operation_cohorts
  FOR DELETE TO authenticated
  USING (private.is_organization_admin(organization_id, (select auth.uid())));

DROP TRIGGER IF EXISTS operation_offers_set_updated_at ON public.operation_offers;
CREATE TRIGGER operation_offers_set_updated_at
  BEFORE UPDATE ON public.operation_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS operation_cohorts_set_updated_at ON public.operation_cohorts;
CREATE TRIGGER operation_cohorts_set_updated_at
  BEFORE UPDATE ON public.operation_cohorts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON TABLE public.operation_offers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.operation_offers TO authenticated;

REVOKE ALL ON TABLE public.operation_cohorts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.operation_cohorts TO authenticated;

REVOKE ALL ON FUNCTION public.create_organization(text, text, text, text, text[], text, text, text, text, text, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text, text, text, text[], text, text, text, text, text, text, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.publish_organization(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_organization(uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.mark_organization_owner_profile(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.mark_organization_owner_profile(uuid, text, text) TO authenticated;
