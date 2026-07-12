-- Adiciona filtro de esporte (p_sports text[]) ao feed mantendo INTEGRALMENTE a
-- lógica de recomendações de 20260613024258_feed_home_posts_page_with_recommendations.sql.
-- Quando p_sports vem preenchido, restringe ambos os streams (seguidos + recomendados)
-- a posts cujo criador tenha overlap em creator_profiles.sports.
-- Datada após a migration de recomendações para ser a palavra final num replay.
-- A assinatura vira (p_limit, p_offset, p_sports); dropamos a antiga (p_limit, p_offset)
-- para evitar ambiguidade de overload no PostgREST.
DROP FUNCTION IF EXISTS public.feed_home_posts_page(integer, integer);

CREATE OR REPLACE FUNCTION public.feed_home_posts_page(p_limit integer, p_offset integer, p_sports text[] DEFAULT NULL)
 RETURNS TABLE(post_id uuid)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT auth.uid() AS uid),
  flt AS (SELECT (p_sports IS NOT NULL AND cardinality(p_sports) > 0) AS active),
  followed_creators AS (
    SELECT cf.creator_id
    FROM creator_follows cf, me
    WHERE cf.follower_id = me.uid AND cf.status = 'active'
  ),
  -- Categorias preferidas, ponderadas por engajamento (combinação dos sinais)
  prefs AS (
    SELECT cp.category AS category, SUM(eng.w)::numeric AS weight
    FROM (
      SELECT cf.creator_id, 1.0::numeric AS w
        FROM creator_follows cf, me
        WHERE cf.follower_id = me.uid AND cf.status = 'active'
      UNION ALL
      SELECT p.creator_id, 1.5::numeric
        FROM post_likes pl JOIN posts p ON p.id = pl.post_id, me
        WHERE pl.user_id = me.uid
      UNION ALL
      SELECT p.creator_id, (0.5 + COALESCE(vv.percentage_watched, 0) / 100.0)::numeric
        FROM video_views vv JOIN posts p ON p.id = vv.post_id, me
        WHERE vv.user_id = me.uid
    ) eng
    JOIN creator_profiles cp ON cp.id = eng.creator_id
    WHERE cp.category IS NOT NULL AND cp.category <> ''
    GROUP BY cp.category
  ),
  -- Stream 1: meus posts + de quem sigo (com filtro de esporte opcional)
  followed AS (
    SELECT p.id AS post_id, p.published_at,
           ROW_NUMBER() OVER (ORDER BY p.published_at DESC NULLS LAST, p.id DESC) AS rn
    FROM public.posts p
    LEFT JOIN creator_profiles cpf ON cpf.id = p.creator_id, me, flt
    WHERE (p.creator_id = me.uid
       OR EXISTS (SELECT 1 FROM followed_creators fc WHERE fc.creator_id = p.creator_id))
      AND (NOT flt.active OR cpf.sports && p_sports)
  ),
  -- Stream 2: recomendados — criadores não seguidos, categoria preferida, público
  recommended AS (
    SELECT p.id AS post_id, p.published_at,
           ROW_NUMBER() OVER (
             ORDER BY (
               COALESCE(pr.weight, 0)
               + LN(1 + COALESCE(p.likes, 0))
               - EXTRACT(EPOCH FROM (now() - COALESCE(p.published_at, now()))) / (60*60*24*30)
             ) DESC, p.published_at DESC NULLS LAST, p.id DESC
           ) AS rn
    FROM public.posts p
    JOIN profiles pf ON pf.id = p.creator_id AND pf.is_creator = true
    JOIN creator_profiles cp ON cp.id = p.creator_id
    JOIN prefs pr ON pr.category = cp.category, me, flt
    WHERE COALESCE(p.visibility, 'public') = 'public'
      AND p.creator_id <> me.uid
      AND NOT EXISTS (SELECT 1 FROM followed_creators fc WHERE fc.creator_id = p.creator_id)
      AND (NOT flt.active OR cp.sports && p_sports)
  ),
  combined AS (
    SELECT post_id, (rn + (rn - 1) / 5) AS slot, published_at, 0 AS src FROM followed
    UNION ALL
    SELECT post_id, (rn * 6) AS slot, published_at, 1 AS src FROM recommended
  )
  SELECT post_id
  FROM combined
  ORDER BY slot, src, published_at DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$function$;

-- SECURITY DEFINER necessário p/ ler video_views (sinal de engajamento). anon não executa.
REVOKE EXECUTE ON FUNCTION public.feed_home_posts_page(integer, integer, text[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.feed_home_posts_page(integer, integer, text[]) TO authenticated;
