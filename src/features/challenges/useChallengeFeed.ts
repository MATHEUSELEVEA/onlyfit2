import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ChallengeComment, ChallengeFeedPost } from './types';

const PROFILE_COLUMNS = 'username, full_name, avatar_url';

interface FeedLogRow {
  id: string;
  user_id: string;
  log_type: string;
  title: string | null;
  text_content: string | null;
  evidence_url: string | null;
  logged_at: string;
  payload_json: { source?: string } | null;
  profile: ChallengeFeedPost['profile'] | ChallengeFeedPost['profile'][] | null;
}

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

/** Feed do desafio: posts dos participantes + check-ins de tarefas. */
export function useChallengeFeed(runId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['challenge-feed', runId] as const,
    enabled: Boolean(runId),
    queryFn: async (): Promise<ChallengeFeedPost[]> => {
      const { data, error } = await supabase
        .from('challenge_logs')
        .select(
          `id, user_id, log_type, title, text_content, evidence_url, logged_at, payload_json,
           profile:user_id(${PROFILE_COLUMNS})`,
        )
        .eq('challenge_run_id', runId!)
        .neq('validation_status', 'removed')
        .order('logged_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      const logs = (data ?? []) as unknown as FeedLogRow[];
      if (logs.length === 0) return [];
      const logIds = logs.map((log) => log.id);

      const [reactions, comments] = await Promise.all([
        supabase.from('challenge_reactions').select('challenge_log_id, user_id').in('challenge_log_id', logIds),
        supabase.from('challenge_comments').select('challenge_log_id').in('challenge_log_id', logIds),
      ]);
      if (reactions.error) throw reactions.error;
      if (comments.error) throw comments.error;

      const likeCounts = new Map<string, number>();
      const likedByMe = new Set<string>();
      for (const row of reactions.data ?? []) {
        const logId = row.challenge_log_id as string;
        likeCounts.set(logId, (likeCounts.get(logId) ?? 0) + 1);
        if (row.user_id === userId) likedByMe.add(logId);
      }
      const commentCounts = new Map<string, number>();
      for (const row of comments.data ?? []) {
        const logId = row.challenge_log_id as string;
        commentCounts.set(logId, (commentCounts.get(logId) ?? 0) + 1);
      }

      return logs.map((log) => ({
        id: log.id,
        user_id: log.user_id,
        log_type: log.log_type,
        title: log.title,
        text_content: log.text_content,
        evidence_url: log.evidence_url,
        logged_at: log.logged_at,
        payload_json: log.payload_json,
        profile: firstOrNull(log.profile),
        like_count: likeCounts.get(log.id) ?? 0,
        liked_by_me: likedByMe.has(log.id),
        comment_count: commentCounts.get(log.id) ?? 0,
      }));
    },
  });
}

export function useCreateChallengePost(runId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ text, imageUrl }: { text: string; imageUrl: string | null }) => {
      const { error } = await supabase.from('challenge_logs').insert({
        challenge_run_id: runId,
        user_id: userId,
        log_type: imageUrl ? 'photo' : 'note',
        text_content: text || null,
        evidence_url: imageUrl,
        payload_json: { source: 'feed_post' },
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['challenge-feed', runId] }),
  });
}

export function useToggleChallengeLike(runId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ logId, liked }: { logId: string; liked: boolean }) => {
      if (liked) {
        const { error } = await supabase
          .from('challenge_reactions')
          .delete()
          .eq('challenge_log_id', logId)
          .eq('user_id', userId!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('challenge_reactions').insert({
          challenge_run_id: runId,
          challenge_log_id: logId,
          user_id: userId,
          reaction_type: 'like',
        });
        if (error) throw error;
      }
    },
    // Curtida otimista: ajusta o post no cache e reverte se o banco recusar.
    onMutate: async ({ logId, liked }) => {
      await queryClient.cancelQueries({ queryKey: ['challenge-feed', runId] });
      const previous = queryClient.getQueryData<ChallengeFeedPost[]>(['challenge-feed', runId]);
      queryClient.setQueryData<ChallengeFeedPost[]>(['challenge-feed', runId], (posts) =>
        (posts ?? []).map((post) =>
          post.id === logId
            ? { ...post, liked_by_me: !liked, like_count: post.like_count + (liked ? -1 : 1) }
            : post,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['challenge-feed', runId], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['challenge-feed', runId] }),
  });
}

/** Moderação: autor ou criador tira o post do feed (RLS decide quem pode). */
export function useRemoveChallengePost(runId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabase
        .from('challenge_logs')
        .update({ validation_status: 'removed' })
        .eq('id', logId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['challenge-feed', runId] }),
  });
}

interface CommentRow {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile: ChallengeComment['profile'] | ChallengeComment['profile'][] | null;
}

export function useChallengeComments(runId: string | undefined, logId: string | null) {
  return useQuery({
    queryKey: ['challenge-comments', runId, logId] as const,
    enabled: Boolean(runId && logId),
    queryFn: async (): Promise<ChallengeComment[]> => {
      const { data, error } = await supabase
        .from('challenge_comments')
        .select(`id, user_id, body, created_at, profile:user_id(${PROFILE_COLUMNS})`)
        .eq('challenge_log_id', logId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as CommentRow[]).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        body: row.body,
        created_at: row.created_at,
        profile: firstOrNull(row.profile),
      }));
    },
  });
}

export function useAddChallengeComment(runId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ logId, body }: { logId: string; body: string }) => {
      const { error } = await supabase.from('challenge_comments').insert({
        challenge_run_id: runId,
        challenge_log_id: logId,
        user_id: userId,
        body,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { logId }) => {
      queryClient.invalidateQueries({ queryKey: ['challenge-comments', runId, logId] });
      queryClient.invalidateQueries({ queryKey: ['challenge-feed', runId] });
    },
  });
}

export function useDeleteChallengeComment(runId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId }: { commentId: string; logId: string }) => {
      const { error } = await supabase.from('challenge_comments').delete().eq('id', commentId);
      if (error) throw error;
    },
    onSuccess: (_data, { logId }) => {
      queryClient.invalidateQueries({ queryKey: ['challenge-comments', runId, logId] });
      queryClient.invalidateQueries({ queryKey: ['challenge-feed', runId] });
    },
  });
}
