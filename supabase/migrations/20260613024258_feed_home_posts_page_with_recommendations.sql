-- Feed home: posts próprios + de quem sigo (criador ou não), intercalados ~5:1
-- com recomendações de criadores NÃO seguidos cujo conteúdo é parecido com o que
-- engajo (categoria ponderada por follow + curtidas + views). Mantém assinatura
-- (p_limit, p_offset) e retorno (post_id uuid). Os ids passam por nova hidratação
-- no cliente sob RLS, então paid posts não-visíveis são descartados lá.
CREATE OR REPLACE FUNCTION public.feed_home_posts_page(p_limit integer, p_offset integer)
 RETURNS TABLE(post_id uuid)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT auth.uid() AS uid),
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
  -- Stream 1: meus posts + de quem sigo
  followed AS (
    SELECT p.id AS post_id, p.published_at,
           ROW_NUMBER() OVER (ORDER BY p.published_at DESC NULLS LAST, p.id DESC) AS rn
    FROM public.posts p, me
    WHERE p.creator_id = me.uid
       OR EXISTS (SELECT 1 FROM followed_creators fc WHERE fc.creator_id = p.creator_id)
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
    JOIN prefs pr ON pr.category = cp.category, me
    WHERE COALESCE(p.visibility, 'public') = 'public'
      AND p.creator_id <> me.uid
      AND NOT EXISTS (SELECT 1 FROM followed_creators fc WHERE fc.creator_id = p.creator_id)
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

-- SECURITY DEFINER é necessário porque a RLS de video_views não permite que um
-- usuário leia o próprio histórico de visualizações (sinal de engajamento do feed).
-- Mitiga exposição: anon não deve executar (feed exige login; retorna 0).
REVOKE EXECUTE ON FUNCTION public.feed_home_posts_page(integer, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.feed_home_posts_page(integer, integer) TO authenticated;
