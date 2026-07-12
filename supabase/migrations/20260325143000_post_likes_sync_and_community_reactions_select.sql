-- Keep posts.likes in sync with post_likes (feed reads denormalized column; toggles only touch post_likes).
-- Allow authenticated users to SELECT all community_post_reactions (ORs with stricter policies) so mural like counts work.

-- ── posts.likes ↔ post_likes ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_sync_posts_likes_from_post_likes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET likes = COALESCE(likes, 0) + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET likes = GREATEST(COALESCE(likes, 0) - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_likes_sync_posts_likes_ins ON public.post_likes;
CREATE TRIGGER trg_post_likes_sync_posts_likes_ins
  AFTER INSERT ON public.post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_posts_likes_from_post_likes();

DROP TRIGGER IF EXISTS trg_post_likes_sync_posts_likes_del ON public.post_likes;
CREATE TRIGGER trg_post_likes_sync_posts_likes_del
  AFTER DELETE ON public.post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_posts_likes_from_post_likes();

UPDATE public.posts AS p
SET likes = COALESCE(s.cnt, 0)
FROM (
  SELECT post_id, (COUNT(*))::integer AS cnt
  FROM public.post_likes
  GROUP BY post_id
) AS s
WHERE p.id = s.post_id;

UPDATE public.posts AS p
SET likes = 0
WHERE COALESCE(p.likes, 0) <> 0
  AND NOT EXISTS (SELECT 1 FROM public.post_likes pl WHERE pl.post_id = p.id);

-- ── community_post_reactions: mural counts ────────────────────────────────
-- ENABLE RLS para proteger de fato a tabela. Antes estava comentado "Do not ENABLE ROW LEVEL SECURITY here"
-- o que deixava a tabela sem protecao alguma contra writes indevidos.
ALTER TABLE public.community_post_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_post_reactions_select_all_authenticated" ON public.community_post_reactions;
CREATE POLICY "community_post_reactions_select_all_authenticated"
  ON public.community_post_reactions
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: authenticated users can insert their own reactions
DROP POLICY IF EXISTS "community_post_reactions_insert_own" ON public.community_post_reactions;
CREATE POLICY "community_post_reactions_insert_own"
  ON public.community_post_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: authenticated users can update/delete their own reactions
DROP POLICY IF EXISTS "community_post_reactions_manage_own" ON public.community_post_reactions;
CREATE POLICY "community_post_reactions_manage_own"
  ON public.community_post_reactions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
