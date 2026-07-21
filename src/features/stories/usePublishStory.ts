import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { captureVideoPoster, uploadAsset } from '@/features/studio/upload';
import { fileExtension } from '@/features/studio/media';
import type { PostVisibility } from '@/features/studio/useCreatePost';
import type { StoryMediaKind } from './types';

export interface PublishStoryInput {
  file: File;
  kind: StoryMediaKind;
  visibility: PostVisibility;
}

// Story de foto não tem duração própria (é uma imagem estática) — usa o
// mesmo tempo de exibição fixo que Instagram/WhatsApp Status usam.
const PHOTO_STORY_DURATION_SECONDS = 5;
// Trava dura do servidor é 60s (create_story); aqui é só o valor default caso
// a leitura de metadata do vídeo falhe.
const FALLBACK_VIDEO_DURATION_SECONDS = 15;
const MAX_STORY_DURATION_SECONDS = 60;

function measureVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    const cleanup = () => URL.revokeObjectURL(url);
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : FALLBACK_VIDEO_DURATION_SECONDS;
      cleanup();
      resolve(Math.min(duration, MAX_STORY_DURATION_SECONDS));
    };
    video.onerror = () => {
      cleanup();
      resolve(FALLBACK_VIDEO_DURATION_SECONDS);
    };
  });
}

// Publica um story: sobe a mídia para o bucket dedicado onlyfit-stories,
// mede a duração real de vídeo (server revalida em create_story, nunca
// confia só nisso), gera poster para vídeo e chama a RPC de criação — mesmo
// desenho de useCreatePost.ts para posts, mas com schema/tabela próprios.
export function usePublishStory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PublishStoryInput): Promise<string> => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error('Sua sessão expirou. Entre novamente.');
      const userId = authData.user.id;

      const stamp = Date.now();
      const ext = fileExtension(input.file) || (input.kind === 'image' ? 'jpg' : 'mp4');
      const contentType = input.file.type || (input.kind === 'image' ? 'image/jpeg' : 'video/mp4');
      const mediaUrl = await uploadAsset(input.file, `story_${stamp}.${ext}`, contentType, 'onlyfit-stories');

      let thumbnailUrl: string | null = null;
      let durationSeconds = PHOTO_STORY_DURATION_SECONDS;
      if (input.kind === 'video') {
        durationSeconds = await measureVideoDurationSeconds(input.file);
        const poster = await captureVideoPoster(input.file);
        if (poster) {
          thumbnailUrl = await uploadAsset(poster, `story_thumb_${stamp}.jpg`, 'image/jpeg', 'onlyfit-thumbnails');
        }
      }

      const { data: storyId, error } = await supabase.rpc('create_story', {
        p_story: {
          creator_id: userId,
          media_type: input.kind,
          media_url: mediaUrl,
          thumbnail_url: thumbnailUrl,
          duration_seconds: durationSeconds,
          visibility: input.visibility,
        },
      });
      if (error) throw error;
      return String(storyId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stories', 'active'] });
    },
  });
}
