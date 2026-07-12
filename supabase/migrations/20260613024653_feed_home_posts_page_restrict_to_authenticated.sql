-- Restrict feed pagination RPC to authenticated users only.
-- The function was introduced by 20260613024258 and later replaced by the
-- sport-filter overload, but keeping this historical migration locally makes
-- the repository's migration timeline match the remote Supabase history.

REVOKE EXECUTE ON FUNCTION public.feed_home_posts_page(integer, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.feed_home_posts_page(integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
