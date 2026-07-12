-- MVP 3 — descoberta de comunidades por nicho SEM afrouxar a RLS de communities
-- (que é members-only). RPC SECURITY DEFINER expõe só campos públicos de vitrine.
CREATE OR REPLACE FUNCTION public.discover_communities_by_sport(p_sport text)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  member_count integer,
  sports text[],
  creator_id uuid,
  creator_username text,
  creator_full_name text,
  creator_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.id, c.name, c.description, c.member_count, c.sports,
         c.creator_id, pf.username, pf.full_name, pf.avatar_url
  FROM public.communities c
  JOIN public.profiles pf ON pf.id = c.creator_id
  WHERE p_sport = ANY (c.sports)
  ORDER BY c.member_count DESC NULLS LAST
  LIMIT 12;
$function$;

REVOKE EXECUTE ON FUNCTION public.discover_communities_by_sport(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.discover_communities_by_sport(text) TO authenticated;
