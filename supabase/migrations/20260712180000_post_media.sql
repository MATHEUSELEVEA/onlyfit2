-- Mídia por post: habilita imagem única e carrossel (imagem e/ou vídeo) no feed.
--
-- Contexto: o feed do v1 guarda uma única mídia em posts.video_url/thumbnail_url
-- (+ metadata.media_kind). Isso cobre "vídeo único" e "imagem única", mas não
-- carrossel. Esta tabela adiciona N páginas ordenadas por post, cada uma imagem
-- OU vídeo, sem redesenhar posts. Posts de mídia única continuam funcionando
-- sem linha aqui (o feed cai no fallback video_url/thumbnail_url).
--
-- Aditivo e compatível com o v1: o v1 ignora post_media; nada quebra.

CREATE TABLE IF NOT EXISTS public.post_media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  position      integer NOT NULL DEFAULT 0,
  kind          text NOT NULL CHECK (kind IN ('image', 'video')),
  url           text NOT NULL,
  thumbnail_url text,
  aspect_ratio  text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Ordem estável e única das páginas dentro de um post.
CREATE UNIQUE INDEX IF NOT EXISTS post_media_post_id_position_key
  ON public.post_media (post_id, position);
CREATE INDEX IF NOT EXISTS post_media_post_id_idx
  ON public.post_media (post_id);

ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;

-- SELECT: delega a visibilidade à própria RLS de posts. O subquery em posts
-- roda sob as policies de posts, então se a linha do post não é visível para o
-- usuário, sua mídia também não é — sem duplicar resolve_creator_access aqui.
CREATE POLICY "post_media_select" ON public.post_media
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.posts p WHERE p.id = post_media.post_id
  ));

-- Escrita: só o dono do post mexe na mídia dele.
CREATE POLICY "post_media_insert" ON public.post_media
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_media.post_id AND p.creator_id = auth.uid()
  ));

CREATE POLICY "post_media_update" ON public.post_media
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_media.post_id AND p.creator_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_media.post_id AND p.creator_id = auth.uid()
  ));

CREATE POLICY "post_media_delete" ON public.post_media
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_media.post_id AND p.creator_id = auth.uid()
  ));

GRANT SELECT ON public.post_media TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.post_media TO authenticated;

NOTIFY pgrst, 'reload schema';
