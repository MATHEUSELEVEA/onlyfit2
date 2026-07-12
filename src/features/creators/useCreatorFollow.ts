import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// Tipo estrutural mínimo do cache que este hook atualiza de forma otimista
// (evita acoplar creators ↔ explore por import de tipos).
interface ExploreCreatorLike {
  id: string;
  followedByMe: boolean;
}

export function useCreatorFollowState(creatorId: string | null | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['creator-follow', creatorId, userId],
    enabled: Boolean(creatorId && userId),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('creator_follows')
        .select('creator_id')
        .eq('creator_id', creatorId!)
        .eq('follower_id', userId!)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;
      return Boolean(data);
    },
  });
}

// Seguir/deixar de seguir persistido em `creator_follows` (upsert/delete,
// como no onlyfit v1), com atualização otimista dos caches de explorar e
// do estado do perfil do creator.
export function useToggleCreatorFollow(creatorId: string | null | undefined) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (nextFollowing: boolean) => {
      if (!creatorId || !userId) throw new Error('Sessão expirada. Entre novamente.');

      if (nextFollowing) {
        const { error } = await supabase
          .from('creator_follows')
          .upsert(
            { creator_id: creatorId, follower_id: userId, status: 'active' },
            { onConflict: 'creator_id,follower_id' },
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('creator_follows')
          .delete()
          .eq('creator_id', creatorId)
          .eq('follower_id', userId);
        if (error) throw error;
      }
    },
    onMutate: async (nextFollowing) => {
      if (!creatorId) return {};
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['explore-creators'] }),
        queryClient.cancelQueries({ queryKey: ['creator-follow', creatorId] }),
      ]);

      const exploreSnapshot = queryClient.getQueriesData<ExploreCreatorLike[]>({
        queryKey: ['explore-creators'],
      });

      queryClient.setQueriesData<ExploreCreatorLike[]>({ queryKey: ['explore-creators'] }, (creators) =>
        creators?.map((creator) =>
          creator.id === creatorId ? { ...creator, followedByMe: nextFollowing } : creator,
        ),
      );
      queryClient.setQueryData(['creator-follow', creatorId, userId], nextFollowing);

      return { exploreSnapshot };
    },
    onError: (_error, nextFollowing, context) => {
      context?.exploreSnapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      queryClient.setQueryData(['creator-follow', creatorId, userId], !nextFollowing);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-follow', creatorId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['feed-available-sports'] });
    },
  });
}
