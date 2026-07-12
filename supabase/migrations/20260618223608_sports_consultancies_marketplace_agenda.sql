-- Consultorias esportivas: marketplace, organizacoes, agenda e jornada do aluno.
-- Aditivo ao Pro Coach: coach_relationships continua funcionando e pode ser
-- vinculado a organization_clients sem virar unica fonte da jornada.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public;
GRANT USAGE ON SCHEMA private TO anon, authenticated;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_default_workspace_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_default_workspace_check
  CHECK (default_workspace IS NULL OR default_workspace IN ('student','coach','nutrition','creator','sports','facility'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_onboarding_track_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_onboarding_track_check
  CHECK (onboarding_track IS NULL OR onboarding_track IN (
    'athlete','personal_trainer','nutritionist','hybrid_professional','creator',
    'sports_consultancy','facility_owner'
  ));

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('facility','sports_consultancy')),
  subtype text NOT NULL CHECK (subtype IN (
    'gym','box','studio','fight_gym','run_club',
    'running_consultancy','cycling_consultancy','triathlon_consultancy','multi_sport_consultancy'
  )),
  sports text[] NOT NULL DEFAULT '{}',
  city text,
  state text,
  country text NOT NULL DEFAULT 'BR',
  service_mode text NOT NULL DEFAULT 'online' CHECK (service_mode IN ('online','in_person','hybrid')),
  bio text,
  logo_url text,
  cover_url text,
  verified boolean NOT NULL DEFAULT false,
  active_since date,
  published_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_key UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS organizations_owner_idx ON public.organizations (owner_id);
CREATE INDEX IF NOT EXISTS organizations_kind_status_idx ON public.organizations (kind, status);
CREATE INDEX IF NOT EXISTS organizations_subtype_idx ON public.organizations (subtype);
CREATE INDEX IF NOT EXISTS organizations_sports_gin_idx ON public.organizations USING gin (sports);
CREATE INDEX IF NOT EXISTS organizations_city_state_idx ON public.organizations (lower(city), lower(state));

CREATE TABLE IF NOT EXISTS public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','admin','coach','staff')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('active','pending','removed')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_members_user_idx ON public.organization_members (user_id, status);
CREATE INDEX IF NOT EXISTS organization_members_org_role_idx ON public.organization_members (organization_id, role, status);

CREATE TABLE IF NOT EXISTS public.organization_places (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'primary' CHECK (role IN ('primary','branch','partner')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, place_id)
);

CREATE INDEX IF NOT EXISTS organization_places_place_idx ON public.organization_places (place_id, status);

CREATE TABLE IF NOT EXISTS public.organization_clients (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  coach_relationship_id uuid REFERENCES public.coach_relationships(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('active','pending_payment','paused','cancelled')),
  active_since date,
  cancelled_at timestamptz,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('checkout','manual','migration')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_clients_user_status_idx ON public.organization_clients (user_id, status);
CREATE INDEX IF NOT EXISTS organization_clients_org_status_idx ON public.organization_clients (organization_id, status);
CREATE INDEX IF NOT EXISTS organization_clients_coach_idx ON public.organization_clients (coach_id);
CREATE INDEX IF NOT EXISTS organization_clients_relationship_idx ON public.organization_clients (coach_relationship_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coach_relationships' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.coach_relationships
      ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS coach_relationships_organization_idx
  ON public.coach_relationships (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.organization_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('group_training','race','live','workshop','checkin','social','other')),
  sport text CHECK (sport IS NULL OR sport IN ('cycling','martial_arts','bodybuilding','running','triathlon','crossfit')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  location_type text NOT NULL DEFAULT 'online' CHECK (location_type IN ('online','in_person','hybrid')),
  city text,
  state text,
  place_id uuid REFERENCES public.places(id) ON DELETE SET NULL,
  meeting_url text,
  visibility text NOT NULL DEFAULT 'members' CHECK (visibility IN ('public','members','private')),
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS organization_events_org_start_idx ON public.organization_events (organization_id, starts_at);
CREATE INDEX IF NOT EXISTS organization_events_sport_start_idx ON public.organization_events (sport, starts_at);
CREATE INDEX IF NOT EXISTS organization_events_visibility_status_idx ON public.organization_events (visibility, status, starts_at);

CREATE TABLE IF NOT EXISTS public.organization_event_participants (
  event_id uuid NOT NULL REFERENCES public.organization_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'interested' CHECK (status IN ('going','interested','cancelled','completed')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','consultancy','community')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_event_participants_user_idx
  ON public.organization_event_participants (user_id, status);

CREATE TABLE IF NOT EXISTS public.user_sport_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  sport text NOT NULL CHECK (sport IN ('cycling','martial_arts','bodybuilding','running','triathlon','crossfit')),
  goal_type text NOT NULL CHECK (goal_type IN (
    'first_5k','first_10k','half_marathon','marathon','performance','health','return_to_training'
  )),
  target_event_id uuid REFERENCES public.organization_events(id) ON DELETE SET NULL,
  target_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','paused','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_sport_goals_user_status_idx ON public.user_sport_goals (user_id, status);
CREATE INDEX IF NOT EXISTS user_sport_goals_org_idx ON public.user_sport_goals (organization_id);

DROP TRIGGER IF EXISTS organizations_set_updated_at ON public.organizations;
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS organization_places_set_updated_at ON public.organization_places;
CREATE TRIGGER organization_places_set_updated_at
  BEFORE UPDATE ON public.organization_places
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS organization_clients_set_updated_at ON public.organization_clients;
CREATE TRIGGER organization_clients_set_updated_at
  BEFORE UPDATE ON public.organization_clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS organization_events_set_updated_at ON public.organization_events;
CREATE TRIGGER organization_events_set_updated_at
  BEFORE UPDATE ON public.organization_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS organization_event_participants_set_updated_at ON public.organization_event_participants;
CREATE TRIGGER organization_event_participants_set_updated_at
  BEFORE UPDATE ON public.organization_event_participants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS user_sport_goals_set_updated_at ON public.user_sport_goals;
CREATE TRIGGER user_sport_goals_set_updated_at
  BEFORE UPDATE ON public.user_sport_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION private.is_organization_member(p_organization_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_organization_id AND o.owner_id = p_user_id
    UNION ALL
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = p_user_id
      AND om.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.is_organization_admin(p_organization_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_organization_id AND o.owner_id = p_user_id
    UNION ALL
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = p_user_id
      AND om.status = 'active'
      AND om.role IN ('owner','admin')
  );
$$;

CREATE OR REPLACE FUNCTION private.is_organization_staff(p_organization_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_organization_id AND o.owner_id = p_user_id
    UNION ALL
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = p_user_id
      AND om.status = 'active'
      AND om.role IN ('owner','admin','coach','staff')
  );
$$;

CREATE OR REPLACE FUNCTION private.is_organization_client(p_organization_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_clients oc
    WHERE oc.organization_id = p_organization_id
      AND oc.user_id = p_user_id
      AND oc.status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION private.is_organization_member(uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION private.is_organization_admin(uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION private.is_organization_staff(uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION private.is_organization_client(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION private.is_organization_member(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_organization_admin(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_organization_staff(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_organization_client(uuid, uuid) TO anon, authenticated;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sport_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_select_public_or_member" ON public.organizations;
CREATE POLICY "organizations_select_public_or_member" ON public.organizations
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    OR owner_id = (select auth.uid())
    OR private.is_organization_member(id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "organizations_insert_owner" ON public.organizations;
CREATE POLICY "organizations_insert_owner" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "organizations_update_admin" ON public.organizations;
CREATE POLICY "organizations_update_admin" ON public.organizations
  FOR UPDATE TO authenticated
  USING (owner_id = (select auth.uid()) OR private.is_organization_admin(id, (select auth.uid())))
  WITH CHECK (owner_id = (select auth.uid()) OR private.is_organization_admin(id, (select auth.uid())));

DROP POLICY IF EXISTS "organizations_delete_owner" ON public.organizations;
CREATE POLICY "organizations_delete_owner" ON public.organizations
  FOR DELETE TO authenticated
  USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "organization_members_select_related" ON public.organization_members;
CREATE POLICY "organization_members_select_related" ON public.organization_members
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR private.is_organization_staff(organization_id, (select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_id AND o.status = 'published'
    )
  );

DROP POLICY IF EXISTS "organization_members_insert_admin" ON public.organization_members;
CREATE POLICY "organization_members_insert_admin" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_organization_admin(organization_id, (select auth.uid()))
    AND role <> 'owner'
  );

DROP POLICY IF EXISTS "organization_members_update_admin" ON public.organization_members;
CREATE POLICY "organization_members_update_admin" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (private.is_organization_admin(organization_id, (select auth.uid())))
  WITH CHECK (
    private.is_organization_admin(organization_id, (select auth.uid()))
    AND role <> 'owner'
  );

DROP POLICY IF EXISTS "organization_members_delete_admin" ON public.organization_members;
CREATE POLICY "organization_members_delete_admin" ON public.organization_members
  FOR DELETE TO authenticated
  USING (private.is_organization_admin(organization_id, (select auth.uid())) AND role <> 'owner');

DROP POLICY IF EXISTS "organization_places_select_visible" ON public.organization_places;
CREATE POLICY "organization_places_select_visible" ON public.organization_places
  FOR SELECT TO anon, authenticated
  USING (
    (
      status = 'active'
      AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.status = 'published')
    )
    OR private.is_organization_member(organization_id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "organization_places_write_admin" ON public.organization_places;
CREATE POLICY "organization_places_write_admin" ON public.organization_places
  FOR ALL TO authenticated
  USING (private.is_organization_admin(organization_id, (select auth.uid())))
  WITH CHECK (private.is_organization_admin(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS "organization_clients_select_self_or_staff" ON public.organization_clients;
CREATE POLICY "organization_clients_select_self_or_staff" ON public.organization_clients
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR coach_id = (select auth.uid())
    OR private.is_organization_staff(organization_id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "organization_clients_insert_staff" ON public.organization_clients;
CREATE POLICY "organization_clients_insert_staff" ON public.organization_clients
  FOR INSERT TO authenticated
  WITH CHECK (private.is_organization_staff(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS "organization_clients_update_staff" ON public.organization_clients;
CREATE POLICY "organization_clients_update_staff" ON public.organization_clients
  FOR UPDATE TO authenticated
  USING (
    coach_id = (select auth.uid())
    OR private.is_organization_staff(organization_id, (select auth.uid()))
  )
  WITH CHECK (
    coach_id = (select auth.uid())
    OR private.is_organization_staff(organization_id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "organization_events_select_visible" ON public.organization_events;
CREATE POLICY "organization_events_select_visible" ON public.organization_events
  FOR SELECT TO anon, authenticated
  USING (
    (status = 'published' AND visibility = 'public')
    OR private.is_organization_staff(organization_id, (select auth.uid()))
    OR (
      status = 'published'
      AND visibility IN ('members','private')
      AND (
        private.is_organization_client(organization_id, (select auth.uid()))
        OR private.is_organization_member(organization_id, (select auth.uid()))
      )
    )
  );

DROP POLICY IF EXISTS "organization_events_insert_staff" ON public.organization_events;
CREATE POLICY "organization_events_insert_staff" ON public.organization_events
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND private.is_organization_staff(organization_id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "organization_events_update_staff" ON public.organization_events;
CREATE POLICY "organization_events_update_staff" ON public.organization_events
  FOR UPDATE TO authenticated
  USING (private.is_organization_staff(organization_id, (select auth.uid())))
  WITH CHECK (private.is_organization_staff(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS "organization_events_delete_admin" ON public.organization_events;
CREATE POLICY "organization_events_delete_admin" ON public.organization_events
  FOR DELETE TO authenticated
  USING (private.is_organization_admin(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS "organization_event_participants_select_related" ON public.organization_event_participants;
CREATE POLICY "organization_event_participants_select_related" ON public.organization_event_participants
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organization_events ev
      WHERE ev.id = event_id
        AND private.is_organization_staff(ev.organization_id, (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "organization_event_participants_upsert_self" ON public.organization_event_participants;
CREATE POLICY "organization_event_participants_upsert_self" ON public.organization_event_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.organization_events ev
      WHERE ev.id = event_id
        AND ev.status = 'published'
        AND (
          ev.visibility = 'public'
          OR private.is_organization_client(ev.organization_id, (select auth.uid()))
          OR private.is_organization_member(ev.organization_id, (select auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS "organization_event_participants_update_self" ON public.organization_event_participants;
CREATE POLICY "organization_event_participants_update_self" ON public.organization_event_participants
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_sport_goals_select_self_or_staff" ON public.user_sport_goals;
CREATE POLICY "user_sport_goals_select_self_or_staff" ON public.user_sport_goals
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.is_organization_staff(organization_id, (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "user_sport_goals_insert_self" ON public.user_sport_goals;
CREATE POLICY "user_sport_goals_insert_self" ON public.user_sport_goals
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_sport_goals_update_self_or_staff" ON public.user_sport_goals;
CREATE POLICY "user_sport_goals_update_self_or_staff" ON public.user_sport_goals
  FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.is_organization_staff(organization_id, (select auth.uid()))
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.is_organization_staff(organization_id, (select auth.uid()))
    )
  );

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
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_consultancy_public(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_consultancy_public(text) TO anon, authenticated;

-- Compatibilidade inicial: publica consultorias esportivas a partir de creators
-- com sports configurado. Nao cria clientes nem altera coach_relationships.
INSERT INTO public.organizations (
  owner_id, name, slug, kind, subtype, sports, city, state, country, service_mode,
  bio, logo_url, verified, active_since, published_at, status
)
SELECT
  cp.id,
  left(coalesce(nullif(trim(cp.business_name), ''), nullif(trim(pf.full_name), ''), 'Consultoria OnlyFit'), 120),
  lower(regexp_replace(
    regexp_replace(
      coalesce(nullif(trim(cp.business_name), ''), nullif(trim(pf.username), ''), cp.id::text),
      '[^a-zA-Z0-9]+', '-', 'g'
    ),
    '(^-|-$)', '', 'g'
  )) || '-' || substr(cp.id::text, 1, 8),
  'sports_consultancy',
  CASE
    WHEN 'triathlon' = ANY(coalesce(cp.sports, '{}')) THEN 'triathlon_consultancy'
    WHEN 'cycling' = ANY(coalesce(cp.sports, '{}')) THEN 'cycling_consultancy'
    WHEN 'running' = ANY(coalesce(cp.sports, '{}')) THEN 'running_consultancy'
    ELSE 'multi_sport_consultancy'
  END,
  coalesce(cp.sports, '{}'),
  coalesce(nullif(trim(cp.address_city), ''), pf.city),
  nullif(trim(cp.address_state), ''),
  'BR',
  'hybrid',
  coalesce(cp.bio, pf.bio),
  pf.avatar_url,
  coalesce(cp.verified, false),
  coalesce(cp.created_at::date, current_date),
  now(),
  'published'
FROM public.creator_profiles cp
JOIN public.profiles pf ON pf.id = cp.id
WHERE cardinality(coalesce(cp.sports, '{}')) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.owner_id = cp.id AND o.kind = 'sports_consultancy'
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.organization_members (organization_id, user_id, role, status)
SELECT o.id, o.owner_id, 'owner', 'active'
FROM public.organizations o
WHERE o.kind = 'sports_consultancy'
ON CONFLICT (organization_id, user_id) DO UPDATE
SET role = 'owner', status = 'active';
