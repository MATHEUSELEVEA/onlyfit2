import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { updatePostCaches } from './useFeed';

export interface PostComment {
  id: string;
  userId: string;
  body: string;
  createdAt: string | null;
  author: {
    username: string | null;
    fullName: string | null;
    avatarUrl: string | null;
  };
}

interface CommentRow {
  id: string;
  user_id: string;
  body: string | null;
  created_at: string | null;
  author: {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

function toComment(row: CommentRow): PostComment {
  return {
    id: row.id,
    userId: row.user_id,
    body: row.body ?? '',
    createdAt: row.created_at,
    author: {
      username: row.author?.username ?? null,
      fullName: row.author?.full_name ?? null,
      avatarUrl: row.author?.avatar_url ?? null,
    },
  };
}

// Comentários de um post (tabela `post_comments`, mesma do onlyfit v1).
// postId null = sheet fechado, não busca nada.
export function usePostComments(postId: string | null) {
  return useQuery({
    queryKey: ['post-comments', postId],
    enabled: Boolean(postId),
    queryFn: async (): Promise<PostComment[]> => {
      const { data, error } = await supabase
        .from('post_comments')
        .select('id, user_id, body, created_at, author:user_id (username, full_name, avatar_url)')
        .eq('post_id', postId!)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return ((data ?? []) as unknown as CommentRow[]).map(toComment);
    },
  });
}

export function useAddPostComment(postId: string | null) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (body: string) => {
      if (!userId) throw new Error('Sessão expirada. Entre novamente.');
      if (!postId) throw new Error('Post inválido.');
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Escreva um comentário.');

      const { error } = await supabase
        .from('post_comments')
        .insert({ post_id: postId, user_id: userId, body: trimmed });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
      // Contador do feed: incrementa localmente sem refetch da página inteira.
      if (postId) {
        updatePostCaches(queryClient, postId, (post) => ({
          ...post,
          commentCount: post.commentCount + 1,
        }));
      }
    },
  });
}
