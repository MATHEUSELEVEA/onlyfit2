-- Hardens the production contract for Gestão after the management UI started
-- depending on professional_consultancy/brand/facility kinds, metadata-aware
-- RPCs, and business media uploads.

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

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.metadata IS
  'Commercial profile metadata for professional operations: professionals, story, photos, awards, and sales copy.';

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

  IF p_kind NOT IN ('professional_consultancy','sports_consultancy','brand','facility') THEN
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

REVOKE ALL ON FUNCTION public.create_organization(text, text, text, text, text[], text, text, text, text, text, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text, text, text, text[], text, text, text, text, text, text, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.publish_organization(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_organization(uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.mark_organization_owner_profile(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.mark_organization_owner_profile(uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.get_sports_consultancies(text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.get_my_sports_consultancy(text);
DROP FUNCTION IF EXISTS public.get_consultancy_public(text);

CREATE FUNCTION public.get_sports_consultancies(
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
  metadata jsonb,
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
    b.metadata,
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

CREATE FUNCTION public.get_my_sports_consultancy(p_sport text DEFAULT NULL)
RETURNS TABLE (
  organization_id uuid,
  slug text,
  name text,
  logo_url text,
  cover_url text,
  metadata jsonb,
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
    o.metadata,
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

CREATE FUNCTION public.get_consultancy_public(p_slug text)
RETURNS TABLE (
  organization_id uuid,
  owner_id uuid,
  owner_username text,
  slug text,
  name text,
  bio text,
  logo_url text,
  cover_url text,
  metadata jsonb,
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
    o.metadata,
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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-media',
  'business-media',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'business_media_owner_insert'
  ) THEN
    CREATE POLICY business_media_owner_insert
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'business-media'
        AND (storage.foldername(name))[1] = (select auth.uid())::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'business_media_owner_select'
  ) THEN
    CREATE POLICY business_media_owner_select
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'business-media'
        AND (storage.foldername(name))[1] = (select auth.uid())::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'business_media_owner_update'
  ) THEN
    CREATE POLICY business_media_owner_update
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'business-media'
        AND (storage.foldername(name))[1] = (select auth.uid())::text
      )
      WITH CHECK (
        bucket_id = 'business-media'
        AND (storage.foldername(name))[1] = (select auth.uid())::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'business_media_owner_delete'
  ) THEN
    CREATE POLICY business_media_owner_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'business-media'
        AND (storage.foldername(name))[1] = (select auth.uid())::text
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.broadcast_media_ready(p_user_id uuid, p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM pg_notify(
    'media_ready',
    jsonb_build_object(
      'user_id', p_user_id,
      'post_id', p_post_id,
      'ready_at', now()
    )::text
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.broadcast_media_ready(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_media_ready(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.match_coach_chunks(
  query_embedding vector,
  match_threshold double precision,
  match_count integer,
  p_teacher_id uuid
)
RETURNS TABLE (
  id uuid,
  source_id uuid,
  source_title text,
  content text,
  similarity double precision
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ckc.id,
    ckc.source_id,
    cks.title AS source_title,
    ckc.content,
    1 - (ckc.embedding <=> query_embedding) AS similarity
  FROM public.coach_knowledge_chunks ckc
  JOIN public.coach_knowledge_sources cks ON cks.id = ckc.source_id
  WHERE ckc.tenant_id = p_teacher_id
    AND ckc.embedding IS NOT NULL
    AND 1 - (ckc.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.match_coach_chunks(vector, double precision, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_coach_chunks(vector, double precision, integer, uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_select_self" ON public.platform_admins;
CREATE POLICY "platform_admins_select_self" ON public.platform_admins
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

CREATE SCHEMA IF NOT EXISTS sistemaretiradas;

CREATE TABLE IF NOT EXISTS sistemaretiradas.uazapi_config (
  config_key text PRIMARY KEY,
  config_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sistemaretiradas.uazapi_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sistemaretiradas.whatsapp_credentials (
  customer_id text NOT NULL,
  site_slug text NOT NULL,
  whatsapp_instance_name text,
  uazapi_instance_id text,
  uazapi_token text,
  uazapi_status text,
  uazapi_qr_code text,
  uazapi_phone_number text,
  status text NOT NULL DEFAULT 'active',
  is_global boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, site_slug)
);

ALTER TABLE sistemaretiradas.whatsapp_credentials ENABLE ROW LEVEL SECURITY;
