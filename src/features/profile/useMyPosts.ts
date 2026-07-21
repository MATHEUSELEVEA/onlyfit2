import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { updatePostCaches } from '@/features/feed/useFeed';

// O flag de comentários mora em posts.metadata (jsonb) — sem coluna nova, o
// desktop e o v1 continuam lendo a tabela sem mudança de schema.
export interface MyPost {
  id: string;
  caption: string;
  thumbnailUrl: string | null;
  isVideo: boolean;
  isPremium: boolean;
  likes: number;
  comments: number;
  publishedAt: string;
  commentsDisabled: boolean;
  metadata: Record<string, unknown>;
}

interface MyPostRow {
  id: string;
  title: string | null;
  description: string | null;
  is_premium: boolean | null;
  thumbnail_url: string | null;
  video_url: string | null;
  likes: number | null;
  comments: number | null;
  published_at: string;
  metadata: Record<string, unknown> | null;
}

export function myPostsQueryKey(userId: string | undefined) {
  return ['my-posts', userId] as const;
}

export function commentsDisabledFrom(metadata: Record<string, unknown> | null): boolean {
  return metadata?.comments_disabled === true;
}

function profileGridPosition(metadata: Record<string, unknown>): number | null {
  const value = metadata.profile_grid_position;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function useMyPosts() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: myPostsQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<MyPost[]> => {
      const { data, error } = await supabase
        .from('posts')
        .select(
          'id, title, description, is_premium, thumbnail_url, video_url, likes, comments, published_at, metadata',
        )
        .eq('creator_id', userId!)
        .order('published_at', { ascending: false });
      if (error) throw error;

      const posts = ((data ?? []) as MyPostRow[]).map((row) => ({
        id: row.id,
        caption: row.description ?? row.title ?? '',
        // Capa espelhada em thumbnail_url para vídeo, imagem e carrossel (padrão v1).
        thumbnailUrl: row.thumbnail_url,
        isVideo: Boolean(row.video_url),
        isPremium: Boolean(row.is_premium),
        likes: row.likes ?? 0,
        comments: row.comments ?? 0,
        publishedAt: row.published_at,
        commentsDisabled: commentsDisabledFrom(row.metadata),
        metadata: row.metadata ?? {},
      }));

      return posts.sort((a, b) => {
        const aPosition = profileGridPosition(a.metadata);
        const bPosition = profileGridPosition(b.metadata);
        if (aPosition !== null && bPosition !== null) return aPosition - bPosition;
        // Posts novos, ainda sem posição manual, entram no topo da grade.
        if (aPosition === null && bPosition !== null) return -1;
        if (aPosition !== null && bPosition === null) return 1;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });
    },
  });
}

function useMyPostsCacheUpdate() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = myPostsQueryKey(session?.user.id);

  return (postId: string, update: (post: MyPost) => MyPost) => {
    queryClient.setQueryData<MyPost[]>(queryKey, (posts) =>
      posts?.map((post) => (post.id === postId ? update(post) : post)),
    );
  };
}

export function useUpdateMyPostCaption() {
  const queryClient = useQueryClient();
  const updateMyPosts = useMyPostsCacheUpdate();

  return useMutation({
    mutationFn: async ({ postId, caption }: { postId: string; caption: string }) => {
      const { error } = await supabase
        .from('posts')
        .update({ description: caption.trim() || null })
        .eq('id', postId);
      if (error) throw error;
    },
    onSuccess: (_data, { postId, caption }) => {
      updateMyPosts(postId, (post) => ({ ...post, caption: caption.trim() }));
      updatePostCaches(queryClient, postId, (post) => ({ ...post, caption: caption.trim() }));
    },
  });
}

export function useToggleMyPostComments() {
  const queryClient = useQueryClient();
  const updateMyPosts = useMyPostsCacheUpdate();

  return useMutation({
    mutationFn: async ({ post, disabled }: { post: MyPost; disabled: boolean }) => {
      const { error } = await supabase
        .from('posts')
        .update({ metadata: { ...post.metadata, comments_disabled: disabled } })
        .eq('id', post.id);
      if (error) throw error;
    },
    onSuccess: (_data, { post, disabled }) => {
      updateMyPosts(post.id, (current) => ({
        ...current,
        commentsDisabled: disabled,
        metadata: { ...current.metadata, comments_disabled: disabled },
      }));
      updatePostCaches(queryClient, post.id, (current) => ({
        ...current,
        commentsDisabled: disabled,
      }));
    },
  });
}

export function useDeleteMyPost() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = myPostsQueryKey(session?.user.id);

  return useMutation({
    // As FKs de post_media, post_likes e post_comments são ON DELETE CASCADE:
    // apagar a linha em posts limpa o resto no banco.
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw error;
    },
    onSuccess: (_data, postId) => {
      queryClient.setQueryData<MyPost[]>(queryKey, (posts) =>
        posts?.filter((post) => post.id !== postId),
      );
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['feed-post'] });
    },
  });
}

export function useReorderMyPosts() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = myPostsQueryKey(session?.user.id);

  return useMutation({
    mutationFn: async (orderedPosts: MyPost[]): Promise<MyPost[]> => {
      const nextPosts = orderedPosts.map((post, index) => ({
        ...post,
        metadata: { ...post.metadata, profile_grid_position: index },
      }));
      const results = await Promise.all(nextPosts.map((post) => supabase
        .from('posts')
        .update({ metadata: post.metadata })
        .eq('id', post.id)));
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      return nextPosts;
    },
    onSuccess: (posts) => {
      queryClient.setQueryData<MyPost[]>(queryKey, posts);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
