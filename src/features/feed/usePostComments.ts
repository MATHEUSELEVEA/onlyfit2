import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { updatePostCaches } from './useFeed';

export interface PostComment {
  id: string;
  userId: string;
  body: string;
  createdAt: string | null;
  updatedAt: string | null;
  parentId: string | null;
  author: {
    username: string | null;
    fullName: string | null;
    avatarUrl: string | null;
  };
  replies: PostComment[];
}

interface CommentRow {
  id: string;
  user_id: string;
  body: string | null;
  created_at: string | null;
  updated_at: string | null;
  parent_id: string | null;
  author: {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

function toComment(row: CommentRow): Omit<PostComment, 'replies'> {
  return {
    id: row.id,
    userId: row.user_id,
    body: row.body ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    parentId: row.parent_id,
    author: {
      username: row.author?.username ?? null,
      fullName: row.author?.full_name ?? null,
      avatarUrl: row.author?.avatar_url ?? null,
    },
  };
}

/** Agrupa respostas sob o comentário raiz (1 nível, padrão Instagram). */
export function nestComments(rows: CommentRow[]): PostComment[] {
  const roots: PostComment[] = [];
  const byId = new Map<string, PostComment>();

  for (const row of rows) {
    if (row.parent_id) continue;
    const comment: PostComment = { ...toComment(row), replies: [] };
    byId.set(comment.id, comment);
    roots.push(comment);
  }

  for (const row of rows) {
    if (!row.parent_id) continue;
    const parent = byId.get(row.parent_id);
    if (parent) {
      parent.replies.push({ ...toComment(row), replies: [] });
    } else {
      // Pai ausente (apagado): trata como raiz para não perder o texto.
      roots.push({ ...toComment(row), replies: [] });
    }
  }

  return roots;
}

export function countComments(comments: PostComment[]): number {
  return comments.reduce((total, comment) => total + 1 + comment.replies.length, 0);
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
        .select(
          'id, user_id, body, created_at, updated_at, parent_id, author:user_id (username, full_name, avatar_url)',
        )
        .eq('post_id', postId!)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return nestComments((data ?? []) as unknown as CommentRow[]);
    },
  });
}

export function useAddPostComment(postId: string | null) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async ({ body, parentId }: { body: string; parentId?: string | null }) => {
      if (!userId) throw new Error('Sessão expirada. Entre novamente.');
      if (!postId) throw new Error('Post inválido.');
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Escreva um comentário.');

      const { error } = await supabase.from('post_comments').insert({
        post_id: postId,
        user_id: userId,
        body: trimmed,
        parent_id: parentId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
      if (postId) {
        updatePostCaches(queryClient, postId, (post) => ({
          ...post,
          commentCount: post.commentCount + 1,
        }));
      }
    },
  });
}

export function useEditPostComment(postId: string | null) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async ({ commentId, body }: { commentId: string; body: string }) => {
      if (!userId) throw new Error('Sessão expirada. Entre novamente.');
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Escreva um comentário.');

      const { error } = await supabase
        .from('post_comments')
        .update({ body: trimmed })
        .eq('id', commentId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
    },
  });
}

export function useDeletePostComment(postId: string | null) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (commentId: string) => {
      if (!userId) throw new Error('Sessão expirada. Entre novamente.');

      const { error } = await supabase
        .from('post_comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_data, commentId) => {
      const cached = queryClient.getQueryData<PostComment[]>(['post-comments', postId]);
      let removed = 1;
      if (cached) {
        const root = cached.find((c) => c.id === commentId);
        if (root) removed = 1 + root.replies.length;
      }
      queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
      if (postId) {
        updatePostCaches(queryClient, postId, (post) => ({
          ...post,
          commentCount: Math.max(0, post.commentCount - removed),
        }));
      }
    },
  });
}
