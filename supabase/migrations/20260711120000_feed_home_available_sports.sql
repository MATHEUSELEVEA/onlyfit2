-- Grupos de afinidade que realmente possuem conteúdo no feed do usuário.
--
-- A função replica somente o escopo de elegibilidade de feed_home_posts_page:
-- não calcula ranking nem hidrata posts. O resultado tem no máximo oito linhas
-- e o cliente o mantém em cache por cinco minutos.

CREATE OR REPLACE FUNCTION public.feed_home_available_sports()
RETURNS TABLE(sport text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT auth.uid() AS uid
  ),
  taxonomy AS (
    SELECT sport, position
    FROM unnest(ARRAY[
      'bodybuilding',
      'martial_arts',
      'running',
      'triathlon',
      'crossfit',
      'cycling',
      'swimming',
      'nutrition'
    ]::text[]) WITH ORDINALITY AS known_sports(sport, position)
  ),
  taxonomy_array AS (
    SELECT array_agg(sport ORDER BY position) AS sports
    FROM taxonomy
  ),
  followed_creators AS (
    SELECT cf.creator_id
    FROM public.creator_follows cf, me
    WHERE cf.follower_id = me.uid
      AND cf.status = 'active'
  ),
  prefs AS (
    SELECT DISTINCT cp.category
    FROM (
      SELECT cf.creator_id
      FROM public.creator_follows cf, me
      WHERE cf.follower_id = me.uid AND cf.status = 'active'

      UNION

      SELECT p.creator_id
      FROM public.post_likes pl
      JOIN public.posts p ON p.id = pl.post_id, me
      WHERE pl.user_id = me.uid

      UNION

      SELECT p.creator_id
      FROM public.video_views vv
      JOIN public.posts p ON p.id = vv.post_id, me
      WHERE vv.user_id = me.uid
    ) eng
    JOIN public.creator_profiles cp ON cp.id = eng.creator_id
    WHERE cp.category IS NOT NULL AND cp.category <> ''
  ),
  eligible_sports AS (
    SELECT CASE
      WHEN cardinality(COALESCE(p.sports, '{}')) > 0 THEN p.sports
      ELSE COALESCE(cp.sports, '{}')
    END AS sports
    FROM public.posts p
    LEFT JOIN public.creator_profiles cp ON cp.id = p.creator_id,
         me,
         taxonomy_array tx
    WHERE (
        p.creator_id = me.uid
        OR EXISTS (
          SELECT 1 FROM followed_creators fc WHERE fc.creator_id = p.creator_id
        )
      )
      AND (
        p.sports && tx.sports
        OR (
          cardinality(COALESCE(p.sports, '{}')) = 0
          AND cp.sports && tx.sports
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_blocks ub
        WHERE (ub.blocker_id = me.uid AND ub.blocked_id = p.creator_id)
           OR (ub.blocker_id = p.creator_id AND ub.blocked_id = me.uid)
      )

    UNION ALL

    SELECT CASE
      WHEN cardinality(COALESCE(p.sports, '{}')) > 0 THEN p.sports
      ELSE COALESCE(cp.sports, '{}')
    END AS sports
    FROM public.posts p
    JOIN public.profiles pf ON pf.id = p.creator_id AND pf.is_creator = true
    JOIN public.creator_profiles cp ON cp.id = p.creator_id
    JOIN prefs preference ON preference.category = cp.category,
         me,
         taxonomy_array tx
    WHERE COALESCE(p.visibility, 'public') = 'public'
      AND p.creator_id <> me.uid
      AND NOT EXISTS (
        SELECT 1 FROM followed_creators fc WHERE fc.creator_id = p.creator_id
      )
      AND (
        p.sports && tx.sports
        OR (
          cardinality(COALESCE(p.sports, '{}')) = 0
          AND cp.sports && tx.sports
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_blocks ub
        WHERE (ub.blocker_id = me.uid AND ub.blocked_id = p.creator_id)
           OR (ub.blocker_id = p.creator_id AND ub.blocked_id = me.uid)
      )
  ),
  available AS (
    SELECT DISTINCT value AS sport
    FROM eligible_sports
    CROSS JOIN LATERAL unnest(eligible_sports.sports) AS values(value)
  )
  SELECT taxonomy.sport
  FROM taxonomy
  JOIN available USING (sport)
  ORDER BY taxonomy.position;
$function$;

REVOKE ALL ON FUNCTION public.feed_home_available_sports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feed_home_available_sports() TO authenticated;

COMMENT ON FUNCTION public.feed_home_available_sports() IS
  'Retorna, em ordem da taxonomia, apenas esportes com conteúdo elegível no feed do usuário autenticado.';

NOTIFY pgrst, 'reload schema';
