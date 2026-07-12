-- Corrige o FALSO POSITIVO do banner "novos posts". A checagem antiga comparava o
-- post #1 RANQUEADO de feed_home_posts_page — mas esse ranking usa decay de now() e
-- likes, então o topo muda sozinho (sem post novo) e o banner disparava à toa.
-- Aqui contamos posts GENUINAMENTE novos (published_at > p_since) no escopo do
-- usuário (próprios + de quem ele segue), respeitando o filtro de esporte.
CREATE OR REPLACE FUNCTION public.feed_new_posts_count(p_since timestamptz, p_sports text[] DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT auth.uid() AS uid),
  flt AS (SELECT (p_sports IS NOT NULL AND cardinality(p_sports) > 0) AS active)
  SELECT COALESCE(count(*), 0)::int
  FROM public.posts p
  LEFT JOIN creator_profiles cpf ON cpf.id = p.creator_id, me, flt
  WHERE p_since IS NOT NULL
    AND p.published_at > p_since
    AND (
      p.creator_id = me.uid
      OR EXISTS (
        SELECT 1 FROM creator_follows cf
        WHERE cf.follower_id = me.uid AND cf.status = 'active' AND cf.creator_id = p.creator_id
      )
    )
    AND (
      NOT flt.active
      OR p.sports && p_sports
      OR (cardinality(COALESCE(p.sports, '{}')) = 0 AND cpf.sports && p_sports)
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.feed_new_posts_count(timestamptz, text[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.feed_new_posts_count(timestamptz, text[]) TO authenticated;
