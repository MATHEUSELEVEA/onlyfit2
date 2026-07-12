import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { captureVideoPoster, uploadAsset } from './upload';
import { fileExtension, type DraftMedia } from './media';

export type PostVisibility = 'public' | 'paid_members';

export interface CreatePostInput {
  media: DraftMedia[];
  caption: string;
  sports: string[];
  visibility: PostVisibility;
}

interface UploadedMedia {
  kind: 'image' | 'video';
  url: string;
  thumbnailUrl: string | null;
}

async function uploadDraft(draft: DraftMedia, index: number): Promise<UploadedMedia> {
  const stamp = `${Date.now()}_${index}`;
  const ext = fileExtension(draft.file) || (draft.kind === 'image' ? 'jpg' : 'mp4');
  const contentType = draft.file.type || (draft.kind === 'image' ? 'image/jpeg' : 'video/mp4');

  const url = await uploadAsset(draft.file, `${draft.kind}_${stamp}.${ext}`, contentType, 'onlyfit-media');

  let thumbnailUrl: string | null = null;
  if (draft.kind === 'video') {
    const poster = await captureVideoPoster(draft.file);
    if (poster) {
      thumbnailUrl = await uploadAsset(poster, `thumb_${stamp}.jpg`, 'image/jpeg', 'onlyfit-thumbnails');
    }
  }

  return { kind: draft.kind, url, thumbnailUrl };
}

// Publica um post: sobe cada mídia, cria a linha em `posts` e, quando é
// carrossel (mais de uma página), grava as páginas em `post_media`. Post de
// mídia única fica no formato do v1 (video_url/thumbnail_url), que o feed lê
// pelo fallback — assim o v1 e os grids de perfil continuam enxergando o post.
export function useCreatePost() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePostInput): Promise<string> => {
      const userId = session?.user.id;
      if (!userId) throw new Error('Sua sessão expirou. Entre novamente.');
      if (input.media.length === 0) throw new Error('Escolha ao menos uma mídia.');

      const uploaded = await Promise.all(input.media.map(uploadDraft));
      const cover = uploaded[0];
      const isCarousel = uploaded.length > 1;

      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          creator_id: userId,
          description: input.caption.trim() || null,
          sports: input.sports.length ? input.sports : null,
          is_premium: input.visibility === 'paid_members',
          visibility: input.visibility,
          // Espelha a página de capa no formato de mídia única do v1.
          video_url: cover.kind === 'video' ? cover.url : null,
          thumbnail_url: cover.kind === 'video' ? cover.thumbnailUrl : cover.url,
          metadata: { media_kind: isCarousel ? 'carousel' : cover.kind },
        })
        .select('id')
        .single();
      if (postError) throw postError;

      if (isCarousel) {
        const rows = uploaded.map((media, position) => ({
          post_id: post.id,
          position,
          kind: media.kind,
          url: media.url,
          thumbnail_url: media.thumbnailUrl,
        }));
        const { error: mediaError } = await supabase.from('post_media').insert(rows);
        if (mediaError) throw mediaError;
      }

      return post.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
