import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { FeedMedia, FeedPost } from './types';

const PAGE_SIZE = 10;

const POST_SELECT = `id, creator_id, title, description, is_premium, thumbnail_url, video_url,
   likes, comments, published_at,
   profiles:creator_id!inner (
     username, full_name, avatar_url,
     creator_profiles (verified)
   )`;

// Linha crua retornada pelo select em `posts` (mesmo modelo do onlyfit v1).
interface PostRow {
  id: string;
  creator_id: string;
  title: string | null;
  description: string | null;
  is_premium: boolean;
  thumbnail_url: string | null;
  video_url: string | null;
  likes: number | null;
  comments: number | null;
  published_at: string;
  profiles: {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    creator_profiles:
      | { verified: boolean | null }
      | { verified: boolean | null }[]
      | null;
  } | null;
}

interface PostMediaRow {
  post_id: string;
  position: number;
  kind: 'image' | 'video';
  url: string;
  thumbnail_url: string | null;
}

// Páginas de carrossel por post (tabela post_media, migration 20260712180000).
// Post de mídia única não tem linha aqui — cai no fallback de `singleMedia`.
async function fetchPostMedia(postIds: string[]): Promise<Map<string, FeedMedia[]>> {
  const byPost = new Map<string, FeedMedia[]>();
  if (postIds.length === 0) return byPost;

  const { data, error } = await supabase
    .from('post_media')
    .select('post_id, position, kind, url, thumbnail_url')
    .in('post_id', postIds)
    .order('position', { ascending: true });
  if (error) throw error;

  for (const row of (data ?? []) as PostMediaRow[]) {
    const list = byPost.get(row.post_id) ?? [];
    list.push({ kind: row.kind, url: row.url, thumbnailUrl: row.thumbnail_url });
    byPost.set(row.post_id, list);
  }
  return byPost;
}

// Fallback para posts de mídia única (v1 e legados): monta uma página a partir
// de video_url/thumbnail_url. Vídeo tem video_url; imagem única mora só no
// thumbnail_url (video_url null), como o Studio do v1 grava.
function singleMedia(row: PostRow): FeedMedia[] {
  if (row.video_url) {
    return [{ kind: 'video', url: row.video_url, thumbnailUrl: row.thumbnail_url }];
  }
  if (row.thumbnail_url) {
    return [{ kind: 'image', url: row.thumbnail_url, thumbnailUrl: null }];
  }
  return [];
}

function isVerifiedCreator(profile: PostRow['profiles']): boolean {
  const creatorProfile = Array.isArray(profile?.creator_profiles)
    ? profile.creator_profiles[0]
    : profile?.creator_profiles;
  return creatorProfile?.verified === true;
}

function toFeedPost(
  row: PostRow,
  likedPostIds: Set<string>,
  mediaByPost: Map<string, FeedMedia[]>,
): FeedPost {
  const carousel = mediaByPost.get(row.id);
  return {
    id: row.id,
    author: {
      id: row.creator_id,
      username: row.profiles?.username ?? 'creator',
      displayName: row.profiles?.full_name ?? null,
      avatarUrl: row.profiles?.avatar_url ?? null,
      verified: isVerifiedCreator(row.profiles),
    },
    caption: row.description ?? row.title ?? '',
    media: carousel && carousel.length > 0 ? carousel : singleMedia(row),
    likeCount: row.likes ?? 0,
    commentCount: row.comments ?? 0,
    createdAt: row.published_at,
    product: null, // banner de produto entra na próxima etapa
    likedByMe: likedPostIds.has(row.id),
  };
}

async function fetchLikedPostIds(userId: string, postIds: string[]): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);
  if (error) throw error;
  return new Set(((data ?? []) as { post_id: string }[]).map((row) => row.post_id));
}

async function fetchFeedPosts(userId: string, sports: string[]): Promise<FeedPost[]> {
  // Mesma RPC do onlyfit v1: retorna os ids na ordem correta do feed "home".
  // p_sports null = sem filtro ("Tudo"); array = filtra por grupo de afinidade.
  const { data: idRows, error: rpcError } = await supabase.rpc('feed_home_posts_page', {
    p_limit: PAGE_SIZE,
    p_offset: 0,
    p_sports: sports.length ? sports : null,
  });
  if (rpcError) throw rpcError;

  const ids = ((idRows ?? []) as { post_id: string }[]).map((r) => r.post_id).filter(Boolean);
  if (ids.length === 0) return [];

  const { data, error } = await supabase.from('posts').select(POST_SELECT).in('id', ids);
  if (error) throw error;

  const byId = new Map((data as unknown as PostRow[]).map((row) => [row.id, row]));
  const rows = ids
    .map((id) => byId.get(id))
    .filter((row): row is PostRow => Boolean(row));

  const rowIds = rows.map((row) => row.id);
  const [likedPostIds, mediaByPost] = await Promise.all([
    fetchLikedPostIds(userId, rowIds),
    fetchPostMedia(rowIds),
  ]);

  return rows.map((row) => toFeedPost(row, likedPostIds, mediaByPost));
}

async function fetchFeedPostById(userId: string, postId: string): Promise<FeedPost | null> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', postId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as PostRow;
  const [likedPostIds, mediaByPost] = await Promise.all([
    fetchLikedPostIds(userId, [row.id]),
    fetchPostMedia([row.id]),
  ]);
  return toFeedPost(row, likedPostIds, mediaByPost);
}

async function fetchAvailableFeedSports(): Promise<string[]> {
  const { data, error } = await supabase.rpc('feed_home_available_sports');
  if (error) throw error;
  return ((data ?? []) as { sport: string }[]).map((row) => row.sport);
}

export function useAvailableFeedSports() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['feed-available-sports', userId],
    queryFn: fetchAvailableFeedSports,
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useFeed(sports: string[]) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['feed', userId, sports],
    queryFn: () => fetchFeedPosts(userId!, sports),
    enabled: Boolean(userId),
  });
}

// Post específico aberto a partir do Explorar — entra fixado no topo do
// feed para o usuário assistir sem sair para o perfil do creator.
export function useFeedPost(postId: string | null) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['feed-post', userId, postId],
    queryFn: () => fetchFeedPostById(userId!, postId!),
    enabled: Boolean(userId && postId),
  });
}
