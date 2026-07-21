import type { FeedPost } from '@/features/feed/types';
import type { StoryFeedItem } from './types';

export type FeedEntry =
  | { kind: 'post'; id: string; post: FeedPost }
  | { kind: 'story'; id: string; story: StoryFeedItem };

// Story não tem posição fixa (nem sempre no topo, nem sempre no fim) — entra
// misturado na mesma ordenação dos posts, por data de criação. Recalculado
// toda vez que novas páginas de posts chegam (useMemo no FeedPage), então a
// posição de cada story sempre se ajusta aos posts já carregados até agora.
export function mergeFeedEntries(posts: FeedPost[], stories: StoryFeedItem[]): FeedEntry[] {
  const postEntries: FeedEntry[] = posts.map((post) => ({ kind: 'post', id: post.id, post }));
  const storyEntries: FeedEntry[] = stories.map((story) => ({ kind: 'story', id: story.id, story }));

  return [...postEntries, ...storyEntries].sort((a, b) => {
    const aTime = a.kind === 'post' ? a.post.createdAt : a.story.createdAt;
    const bTime = b.kind === 'post' ? b.post.createdAt : b.story.createdAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}
