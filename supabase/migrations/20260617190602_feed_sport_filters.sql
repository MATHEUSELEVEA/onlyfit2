-- Filtro de esporte na BUSCA de criadores + índice.
-- (O filtro no feed_home_posts_page fica numa migration posterior à de
-- recomendações — ver 20260617193339_feed_home_posts_page_sport_filter.sql — para
-- não regredir a lógica de recomendações.)
-- Adiciona p_sports text[] (overlap com creator_profiles.sports) e retorna sports.
-- Dropa a assinatura antiga para evitar ambiguidade de overload no PostgREST.

-- Índice para acelerar o overlap (&&).
CREATE INDEX IF NOT EXISTS creator_profiles_sports_gin
  ON public.creator_profiles USING gin (sports);

-- ─── search_creators_public ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.search_creators_public(text, integer, integer);

CREATE OR REPLACE FUNCTION public.search_creators_public(
  p_query text,
  p_limit integer DEFAULT 5,
  p_offset integer DEFAULT 0,
  p_sports text[] DEFAULT NULL
) RETURNS TABLE(
  "id" uuid, "username" text, "full_name" text, "avatar_url" text, "category" text,
  "follower_count" integer, "subscriber_count" integer, "subscription_price" numeric, "sports" text[]
)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  pattern text;
  lim int := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 60);
  off int := GREATEST(COALESCE(p_offset, 0), 0);
  has_sports boolean := p_sports IS NOT NULL AND cardinality(p_sports) > 0;
BEGIN
  pattern := NULLIF(
    trim(both from ltrim(trim(both from COALESCE(p_query, '')), '@')),
    ''
  );
  -- Exige >=2 caracteres só quando NÃO há filtro de esporte.
  IF (pattern IS NULL OR length(pattern) < 2) AND NOT has_sports THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    cp.category,
    COALESCE(cp.follower_count, 0)::integer,
    COALESCE(cp.subscriber_count, 0)::integer,
    COALESCE(cp.subscription_price, 0)::numeric,
    cp.sports
  FROM public.profiles p
  LEFT JOIN public.creator_profiles cp ON cp.id = p.id
  WHERE COALESCE(p.is_creator, false) = true
    AND (
      pattern IS NULL
      OR p.username ILIKE '%' || pattern || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || pattern || '%'
    )
    AND (NOT has_sports OR cp.sports && p_sports)
  ORDER BY
    (lower(COALESCE(p.username, '')) LIKE lower(COALESCE(pattern, '')) || '%') DESC,
    (lower(COALESCE(p.full_name, '')) LIKE lower(COALESCE(pattern, '')) || '%') DESC,
    COALESCE(p.full_name, p.username, '') ASC,
    p.username ASC NULLS LAST
  LIMIT lim
  OFFSET off;
END;
$$;

ALTER FUNCTION public.search_creators_public(text, integer, integer, text[]) OWNER TO postgres;
COMMENT ON FUNCTION public.search_creators_public(text, integer, integer, text[]) IS
  'Busca pública de criadores por nome/@; p_sports filtra por overlap com creator_profiles.sports (permite listar só por esporte, sem texto). Retorna sports.';

-- Alinha com a migration base (20260331240000): apenas authenticated executa.
REVOKE ALL ON FUNCTION public.search_creators_public(text, integer, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_creators_public(text, integer, integer, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
