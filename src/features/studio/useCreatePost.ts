import { supabase } from '@/lib/supabase';
import { captureVideoPoster, uploadAsset } from './upload';
import { fileExtension, type DraftMedia } from './media';
import type { MyProfile } from '@/features/profile/useMyProfile';
import type { FeedPost } from '@/features/feed/types';

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

type SupabasePostError = {
  code?: string;
  message?: string;
};

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  return String((error as SupabasePostError).code ?? '');
}

/** Mensagens orientadas à ação, sem expor o payload bruto do PostgREST. */
export function getCreatePostErrorMessage(error: unknown): string {
  const code = errorCode(error);
  const message = error && typeof error === 'object'
    ? String((error as SupabasePostError).message ?? '').toLowerCase()
    : '';

  if (code === '42501' || message.includes('row-level security')) {
    return 'Sua sessão ou seu perfil não tem permissão para publicar este conteúdo. Entre novamente e tente de novo.';
  }
  if (code === '23503') {
    return 'Seu perfil ainda não está pronto para publicar. Atualize seus dados e tente novamente.';
  }
  if (code === '23514' || code === '22023' || code === '22P02') {
    return 'Alguma informação do post está inválida. Revise a mídia e tente novamente.';
  }
  if (code === 'PGRST202') {
    return 'O servidor ainda não terminou de atualizar o fluxo de publicação. Tente novamente em instantes.';
  }
  if (message.includes('failed to fetch') || message.includes('network') || message.includes('timeout')) {
    return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
  }
  if (message.includes('session') || message.includes('jwt') || message.includes('token')) {
    return 'Sua sessão expirou. Entre novamente para publicar.';
  }
  return 'Não foi possível publicar agora. Tente novamente.';
}

async function uploadDraft(
  draft: DraftMedia,
  index: number,
  onProgress?: (fraction: number) => void,
): Promise<UploadedMedia> {
  const stamp = `${Date.now()}_${index}`;
  const ext = fileExtension(draft.file) || (draft.kind === 'image' ? 'jpg' : 'mp4');
  const contentType = draft.file.type || (draft.kind === 'image' ? 'image/jpeg' : 'video/mp4');

  // A mídia em si é a maior parte do upload; o poster (quando precisa subir)
  // é tratado como um extra fora dessa fração de progresso.
  const url = await uploadAsset(draft.file, `${draft.kind}_${stamp}.${ext}`, contentType, 'onlyfit-media', onProgress);

  let thumbnailUrl: string | null = null;
  if (draft.kind === 'video') {
    // Vídeo gravado pela câmera já traz o poster capturado ao vivo do stream
    // (ver useVideoCapture) — pula captureVideoPoster, que abre o arquivo
    // gravado depois e pode travar em .mov/HEVC não decodificável.
    const poster = draft.posterBlob ?? (await captureVideoPoster(draft.file));
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
//
// Corpo do antigo mutationFn de useCreatePost, extraído para ser chamado fora
// de um useMutation: a fila de publicação (publishQueue.ts) roda fora da
// árvore React, para o upload não ser abandonado se o usuário navegar embora
// da tela de detalhes antes de terminar.
export async function runCreatePost(
  input: CreatePostInput,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  // A sessão em memória pode estar desatualizada após refresh/retorno do
  // app. O RLS valida auth.uid(), então confirme o usuário no servidor
  // antes de subir arquivos e mantenha o mesmo ID no payload.
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Sua sessão expirou. Entre novamente.');
  const userId = authData.user.id;
  if (!userId) throw new Error('Sua sessão expirou. Entre novamente.');
  if (input.media.length === 0) throw new Error('Escolha ao menos uma mídia.');

  const progressByIndex = new Array(input.media.length).fill(0);
  const reportProgress = (index: number, fraction: number) => {
    progressByIndex[index] = fraction;
    const total = progressByIndex.reduce((sum, value) => sum + value, 0) / progressByIndex.length;
    onProgress?.(total);
  };

  const uploaded = await Promise.all(
    input.media.map((draft, index) => uploadDraft(draft, index, (fraction) => reportProgress(index, fraction))),
  );
  const cover = uploaded[0];
  const isCarousel = uploaded.length > 1;

  const rows = isCarousel
    ? uploaded.map((media, position) => ({
      position,
      kind: media.kind,
      url: media.url,
      thumbnail_url: media.thumbnailUrl,
    }))
    : [];

  // O RPC grava `posts` e `post_media` na mesma transação, preservando as
  // políticas RLS existentes e evitando post órfão quando uma mídia falha.
  const { data: postId, error: postError } = await supabase.rpc('create_post_with_media', {
    p_post: {
      creator_id: userId,
      description: input.caption.trim() || null,
      sports: input.sports,
      is_premium: input.visibility === 'paid_members',
      visibility: input.visibility,
      // Espelha a página de capa no formato de mídia única do v1.
      video_url: cover.kind === 'video' ? cover.url : null,
      thumbnail_url: cover.kind === 'video' ? cover.thumbnailUrl : cover.url,
      metadata: { media_kind: isCarousel ? 'carousel' : cover.kind },
    },
    p_media: rows,
  });
  if (postError) throw postError;

  return String(postId);
}

// Post provisório para aparecer no topo do feed do próprio autor assim que
// ele confirma a publicação — antes de qualquer upload terminar (ver
// publishQueue.ts). Usa os object URLs locais (previewUrl) como mídia; o
// PostCard reconhece esse id (isLocalPostId) e desabilita as ações que
// dependem do post já existir no banco.
export function buildOptimisticPost(input: CreatePostInput, profile: MyProfile, localId: string): FeedPost {
  return {
    id: localId,
    author: {
      id: profile.userId,
      username: profile.username ?? 'você',
      displayName: profile.fullName,
      avatarUrl: profile.avatarUrl,
      verified: false,
    },
    caption: input.caption,
    media: input.media.map((draft) => ({
      kind: draft.kind,
      url: draft.previewUrl,
      thumbnailUrl: draft.kind === 'video' ? draft.previewUrl : null,
    })),
    likeCount: 0,
    commentCount: 0,
    createdAt: new Date().toISOString(),
    product: null,
    likedByMe: false,
    commentsDisabled: true,
  };
}
