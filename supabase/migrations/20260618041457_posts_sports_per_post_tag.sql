-- MVP 1 — Nichos vivos: esporte vira propriedade do POST (antes vinha só do criador).
-- 1) Coluna posts.sports (text[]) + índice GIN para overlap (&&).
-- 2) Atualiza feed_home_posts_page para filtrar por sports do POST, com fallback
--    ao creator_profiles.sports quando o post ainda não tem tag (posts legados).
-- Datada após 20280522000000 (filtro por criador) para ser a palavra final no replay.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS sports text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS posts_sports_gin_idx
  ON public.posts USING gin (sports);

-- Recria a RPC mantendo INTEGRALMENTE a lógica de recomendações; só muda o predicado
-- de esporte: prioriza p.sports (post) e cai para cpf/cp.sports quando o post não tem tag.
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
  followed AS (
    SELECT p.id AS post_id, p.published_at,
           ROW_NUMBER() OVER (ORDER BY p.published_at DESC NULLS LAST, p.id DESC) AS rn
    FROM public.posts p
    LEFT JOIN creator_profiles cpf ON cpf.id = p.creator_id, me, flt
    WHERE (p.creator_id = me.uid
       OR EXISTS (SELECT 1 FROM followed_creators fc WHERE fc.creator_id = p.creator_id))
      AND (NOT flt.active
        OR p.sports && p_sports
        OR (cardinality(COALESCE(p.sports, '{}')) = 0 AND cpf.sports && p_sports))
  ),
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
      AND (NOT flt.active
        OR p.sports && p_sports
        OR (cardinality(COALESCE(p.sports, '{}')) = 0 AND cp.sports && p_sports))
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

REVOKE EXECUTE ON FUNCTION public.feed_home_posts_page(integer, integer, text[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.feed_home_posts_page(integer, integer, text[]) TO authenticated;
