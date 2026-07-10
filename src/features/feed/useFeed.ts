import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { FeedPost } from './types';

const PAGE_SIZE = 10;

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
    is_creator: boolean | null;
  } | null;
}

function toFeedPost(row: PostRow): FeedPost {
  return {
    id: row.id,
    author: {
      id: row.creator_id,
      username: row.profiles?.username ?? 'creator',
      displayName: row.profiles?.full_name ?? null,
      avatarUrl: row.profiles?.avatar_url ?? null,
      verified: Boolean(row.profiles?.is_creator),
    },
    caption: row.description ?? row.title ?? '',
    mediaUrl: row.video_url ?? row.thumbnail_url,
    mediaType: row.video_url ? 'video' : 'image',
    likeCount: row.likes ?? 0,
    commentCount: row.comments ?? 0,
    createdAt: row.published_at,
    product: null, // banner de produto entra na próxima etapa
  };
}

async function fetchFeedPosts(sports: string[]): Promise<FeedPost[]> {
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

  const { data, error } = await supabase
    .from('posts')
    .select(
      `id, creator_id, title, description, is_premium, thumbnail_url, video_url,
       likes, comments, published_at,
       profiles:creator_id!inner (username, full_name, avatar_url, is_creator)`,
    )
    .in('id', ids);
  if (error) throw error;

  const byId = new Map((data as unknown as PostRow[]).map((row) => [row.id, row]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is PostRow => Boolean(row))
    .map(toFeedPost);
}

export function useFeed(sports: string[]) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['feed', session?.user.id, sports],
    queryFn: () => fetchFeedPosts(sports),
    enabled: Boolean(session),
  });
}
