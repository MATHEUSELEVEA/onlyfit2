import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  cancelPostCaches,
  restorePostCaches,
  snapshotPostCaches,
  updatePostCaches,
} from './useFeed';

interface ToggleLikeVars {
  postId: string;
  liked: boolean;
}

// Curtir/descurtir persistido em `post_likes` (RLS: cada usuário só mexe na
// própria linha), com atualização otimista de todos os caches do feed e
// rollback em caso de erro — mesmo padrão do onlyfit v1.
export function useToggleLike() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async ({ postId, liked }: ToggleLikeVars) => {
      if (!userId) throw new Error('Sessão expirada. Entre novamente.');

      if (liked) {
        const { error } = await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: userId });
        if (error) throw error;
      }
    },
    onMutate: async ({ postId, liked }) => {
      await cancelPostCaches(queryClient);
      const snapshot = snapshotPostCaches(queryClient);

      updatePostCaches(queryClient, postId, (post) => ({
        ...post,
        likedByMe: !liked,
        likeCount: Math.max(0, post.likeCount + (liked ? -1 : 1)),
      }));

      return { snapshot };
    },
    onError: (_error, _vars, context) => {
      if (context) restorePostCaches(queryClient, context.snapshot);
    },
  });
}
