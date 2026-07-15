import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { CollectiveProgress, MyChallengeProgress, RankingRow } from './types';

/** Meu checklist + progresso, calculado no servidor (períodos, adesão, sequência). */
export function useMyChallengeProgress(runId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['challenge-progress', runId] as const,
    enabled: Boolean(runId) && enabled,
    queryFn: async (): Promise<MyChallengeProgress> => {
      const { data, error } = await supabase.rpc('get_my_challenge_progress', { p_run_id: runId });
      if (error) throw error;
      return data as MyChallengeProgress;
    },
  });
}

function useInvalidateProgress(runId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['challenge-progress', runId] });
    queryClient.invalidateQueries({ queryKey: ['challenge-ranking', runId] });
    queryClient.invalidateQueries({ queryKey: ['challenge-collective', runId] });
    queryClient.invalidateQueries({ queryKey: ['challenge-feed', runId] });
  };
}

export function useCompleteTask(runId: string | undefined) {
  const invalidate = useInvalidateProgress(runId);
  return useMutation({
    mutationFn: async ({
      taskId,
      proofUrl,
      proofText,
    }: {
      taskId: string;
      proofUrl?: string | null;
      proofText?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('complete_challenge_task', {
        p_task_id: taskId,
        p_proof_url: proofUrl ?? null,
        p_proof_text: proofText ?? null,
      });
      if (error) throw error;
      return data as { completion_id: string; progress_percent: number; streak_count: number };
    },
    onSuccess: invalidate,
  });
}

export function useUncompleteTask(runId: string | undefined) {
  const invalidate = useInvalidateProgress(runId);
  return useMutation({
    mutationFn: async (completionId: string) => {
      const { error } = await supabase.rpc('uncomplete_challenge_task', {
        p_completion_id: completionId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Ranking cooperativo: ordenado por adesão ("em dia"), sem pódio. */
export function useChallengeRanking(runId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['challenge-ranking', runId] as const,
    enabled: Boolean(runId) && enabled,
    queryFn: async (): Promise<RankingRow[]> => {
      const { data, error } = await supabase.rpc('get_challenge_ranking', {
        p_run_id: runId,
        p_limit: 200,
      });
      if (error) throw error;
      return (data ?? []) as RankingRow[];
    },
  });
}

export function useCollectiveProgress(runId: string | undefined) {
  return useQuery({
    queryKey: ['challenge-collective', runId] as const,
    enabled: Boolean(runId),
    queryFn: async (): Promise<CollectiveProgress | null> => {
      const { data, error } = await supabase.rpc('get_challenge_collective_progress', {
        p_run_id: runId,
      });
      if (error) throw error;
      return (data as CollectiveProgress) ?? null;
    },
  });
}
