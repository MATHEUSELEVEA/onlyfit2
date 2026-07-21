import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { ActiveStoryCreator } from './types';

interface ActiveStoryRpcRow {
  creator_id: string;
  latest_story_id: string;
  story_count: number;
  has_unseen: boolean;
}

interface ProfileRow {
  id: string;
  username: string | null;
  avatar_url: string | null;
}

interface StoryRow {
  id: string;
  creator_id: string;
  created_at: string;
}

// feed_active_stories_by_creator é SECURITY DEFINER (mesmo padrão de
// feed_home_posts_page): devolve candidatos por creator de forma barata. O
// SELECT real em `stories`/`profiles` abaixo, sujeito à RLS de verdade, é
// quem decide o que o usuário de fato pode ver — mesmas duas etapas que o
// feed de posts já usa (useFeed.ts).
async function fetchActiveStories(): Promise<ActiveStoryCreator[]> {
  const { data: rpcRows, error: rpcError } = await supabase.rpc('feed_active_stories_by_creator');
  if (rpcError) throw rpcError;

  const rows = (rpcRows ?? []) as ActiveStoryRpcRow[];
  const creatorIds = rows.map((row) => row.creator_id);
  if (creatorIds.length === 0) return [];

  const [{ data: profileRows, error: profileError }, { data: storyRows, error: storyError }] = await Promise.all([
    supabase.from('profiles').select('id, username, avatar_url').in('id', creatorIds),
    supabase
      .from('stories')
      .select('id, creator_id, created_at')
      .in('creator_id', creatorIds)
      .order('created_at', { ascending: true }),
  ]);
  if (profileError) throw profileError;
  if (storyError) throw storyError;

  const profileById = new Map(((profileRows ?? []) as ProfileRow[]).map((row) => [row.id, row]));
  const storyIdsByCreator = new Map<string, string[]>();
  for (const row of (storyRows ?? []) as StoryRow[]) {
    const list = storyIdsByCreator.get(row.creator_id) ?? [];
    list.push(row.id);
    storyIdsByCreator.set(row.creator_id, list);
  }

  // A RPC pode listar um creator cujos stories a RLS não deixa o SELECT real
  // trazer (ex.: bloqueio aplicado entre a chamada da RPC e o select, janela
  // rara) — nesse caso storyIds fica vazio e o creator é descartado aqui.
  return rows
    .map((row): ActiveStoryCreator | null => {
      const profile = profileById.get(row.creator_id);
      const storyIds = storyIdsByCreator.get(row.creator_id) ?? [];
      if (!profile || storyIds.length === 0) return null;
      return {
        creatorId: row.creator_id,
        username: profile.username ?? 'creator',
        avatarUrl: profile.avatar_url,
        hasUnseen: row.has_unseen,
        storyIds,
      };
    })
    .filter((item): item is ActiveStoryCreator => item !== null);
}

export function useActiveStories() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['stories', 'active', userId],
    queryFn: fetchActiveStories,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}
