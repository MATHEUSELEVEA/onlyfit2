import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { StoryFeedItem, StoryMediaKind } from './types';

interface StoryWithProfileRow {
  id: string;
  creator_id: string;
  media_type: StoryMediaKind;
  media_url: string;
  thumbnail_url: string | null;
  stream_status: string | null;
  stream_playback_url: string | null;
  created_at: string;
  expires_at: string;
  profiles: { username: string | null; avatar_url: string | null } | { username: string | null; avatar_url: string | null }[] | null;
}

function firstProfile(value: StoryWithProfileRow['profiles']) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// Story vira só mais um item do feed principal (sem tela dedicada): esta
// query já devolve os stories individuais, sujeitos à RLS de verdade (mesma
// regra de visibility/expires_at/bloqueio de posts) — sem precisar da RPC
// "vitrine" agrupada por creator, que só fazia sentido para uma barra própria.
async function fetchActiveStoryItems(): Promise<StoryFeedItem[]> {
  const { data, error } = await supabase
    .from('stories')
    .select(
      `id, creator_id, media_type, media_url, thumbnail_url, stream_status, stream_playback_url, created_at, expires_at,
       profiles:creator_id!inner ( username, avatar_url )`,
    )
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as StoryWithProfileRow[]).map((row) => {
    const profile = firstProfile(row.profiles);
    return {
      id: row.id,
      creatorId: row.creator_id,
      username: profile?.username ?? 'creator',
      avatarUrl: profile?.avatar_url ?? null,
      mediaType: row.media_type,
      mediaUrl: row.media_url,
      thumbnailUrl: row.thumbnail_url,
      hlsUrl: row.stream_status === 'ready' ? row.stream_playback_url : null,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  });
}

export function useActiveStoryItems() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['stories', 'active-items', userId],
    queryFn: fetchActiveStoryItems,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}
