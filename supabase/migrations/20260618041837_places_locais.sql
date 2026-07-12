-- MVP 2 — Locais: perfis de academia/box/assessoria/estúdio/fight gym.
-- Usuário se marca como frequentador; busca por cidade; negócio reivindica (claim) e modera.
-- DB compartilhado (PULSE/public): nomes escopados + RLS estrita (sem catch-all).

-- profiles.city: usado para sugerir locais próximos (geo simples, sem PostGIS).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city text;

CREATE TABLE IF NOT EXISTS public.places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'gym'
    CHECK (type IN ('gym','box','run_club','studio','fight_gym','other')),
  sports text[] NOT NULL DEFAULT '{}',
  city text,
  state text,
  country text NOT NULL DEFAULT 'BR',
  lat double precision,
  lng double precision,
  cover_url text,
  bio text,
  verified boolean NOT NULL DEFAULT false,
  claimed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS places_sports_gin_idx ON public.places USING gin (sports);
CREATE INDEX IF NOT EXISTS places_city_idx ON public.places (lower(city));
CREATE INDEX IF NOT EXISTS places_claimed_by_idx ON public.places (claimed_by);

CREATE TABLE IF NOT EXISTS public.place_members (
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending')),
  role text NOT NULL DEFAULT 'frequenter' CHECK (role IN ('frequenter','staff','owner')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (place_id, user_id)
);

CREATE INDEX IF NOT EXISTS place_members_user_idx ON public.place_members (user_id);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.places_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS places_set_updated_at ON public.places;
CREATE TRIGGER places_set_updated_at BEFORE UPDATE ON public.places
  FOR EACH ROW EXECUTE FUNCTION public.places_touch_updated_at();

-- Helper: dono efetivo do local (quem reivindicou ou criou).
CREATE OR REPLACE FUNCTION public.is_place_owner(p_place_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.places pl
    WHERE pl.id = p_place_id
      AND (pl.claimed_by = auth.uid() OR pl.created_by = auth.uid())
  );
$$;

-- ===== RLS =====
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_members ENABLE ROW LEVEL SECURITY;

-- places: leitura para autenticados (diretório); escrita escopada ao dono/criador.
DROP POLICY IF EXISTS "places_select_authenticated" ON public.places;
CREATE POLICY "places_select_authenticated" ON public.places
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "places_insert_creator" ON public.places;
CREATE POLICY "places_insert_creator" ON public.places
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "places_update_owner" ON public.places;
CREATE POLICY "places_update_owner" ON public.places
  FOR UPDATE TO authenticated
  USING (claimed_by = auth.uid() OR created_by = auth.uid())
  WITH CHECK (claimed_by = auth.uid() OR created_by = auth.uid());

DROP POLICY IF EXISTS "places_delete_creator" ON public.places;
CREATE POLICY "places_delete_creator" ON public.places
  FOR DELETE TO authenticated USING (created_by = auth.uid());

-- place_members: leitura para autenticados (mostrar frequentadores);
-- usuário gerencia a própria filiação; dono do local gerencia os membros.
DROP POLICY IF EXISTS "place_members_select_authenticated" ON public.place_members;
CREATE POLICY "place_members_select_authenticated" ON public.place_members
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "place_members_insert_self" ON public.place_members;
CREATE POLICY "place_members_insert_self" ON public.place_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_place_owner(place_id));

DROP POLICY IF EXISTS "place_members_update_self_or_owner" ON public.place_members;
CREATE POLICY "place_members_update_self_or_owner" ON public.place_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_place_owner(place_id))
  WITH CHECK (user_id = auth.uid() OR public.is_place_owner(place_id));

DROP POLICY IF EXISTS "place_members_delete_self_or_owner" ON public.place_members;
CREATE POLICY "place_members_delete_self_or_owner" ON public.place_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_place_owner(place_id));

GRANT EXECUTE ON FUNCTION public.is_place_owner(uuid) TO authenticated;
