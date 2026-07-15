import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { CHALLENGE_COLUMNS } from './useChallenges';
import type {
  ChallengeJoinRequest,
  ChallengeMembership,
  ChallengeParticipantRow,
  ChallengeRun,
} from './types';

const PROFILE_COLUMNS = 'username, full_name, avatar_url';

export function useChallenge(runId: string | undefined) {
  return useQuery({
    queryKey: ['challenge', runId] as const,
    enabled: Boolean(runId),
    queryFn: async (): Promise<ChallengeRun | null> => {
      const { data, error } = await supabase
        .from('challenge_runs')
        .select(CHALLENGE_COLUMNS)
        .eq('id', runId!)
        .maybeSingle();
      if (error) throw error;
      return (data as ChallengeRun) ?? null;
    },
  });
}

export function useChallengeCreator(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['challenge-creator', creatorId] as const,
    enabled: Boolean(creatorId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', creatorId!)
        .maybeSingle();
      if (error) throw error;
      return data as { username: string | null; full_name: string | null; avatar_url: string | null } | null;
    },
  });
}

/** Minha relação com o desafio: criador, participante, solicitação pendente ou nada. */
export function useMyChallengeMembership(run: ChallengeRun | null | undefined, userId: string | undefined) {
  const runId = run?.id;
  return useQuery({
    queryKey: ['challenge-membership', runId, userId] as const,
    enabled: Boolean(runId && userId),
    queryFn: async (): Promise<ChallengeMembership> => {
      if (!runId || !userId) return 'none';
      if (run?.creator_id === userId) return 'owner';
      const [participant, request] = await Promise.all([
        supabase
          .from('challenge_participants')
          .select('user_id')
          .eq('challenge_run_id', runId)
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('challenge_join_requests')
          .select('id')
          .eq('challenge_run_id', runId)
          .eq('requester_id', userId)
          .eq('status', 'pending')
          .maybeSingle(),
      ]);
      if (participant.error) throw participant.error;
      if (request.error) throw request.error;
      if (participant.data) return 'member';
      if (request.data) return 'pending';
      return 'none';
    },
  });
}

function useInvalidateChallenge(runId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['challenge', runId] });
    queryClient.invalidateQueries({ queryKey: ['challenge-membership', runId] });
    queryClient.invalidateQueries({ queryKey: ['challenge-participants', runId] });
    queryClient.invalidateQueries({ queryKey: ['challenge-join-requests', runId] });
    queryClient.invalidateQueries({ queryKey: ['challenge-progress', runId] });
    queryClient.invalidateQueries({ queryKey: ['challenge-ranking', runId] });
    queryClient.invalidateQueries({ queryKey: ['challenge-collective', runId] });
    queryClient.invalidateQueries({ queryKey: ['challenges'] });
  };
}

export type JoinChallengeResult = 'member' | 'joined' | 'requested' | 'ended' | 'closed' | 'full';

/** Entrar (público) ou solicitar participação (privado) — o banco decide. */
export function useJoinChallenge(runId: string | undefined) {
  const invalidate = useInvalidateChallenge(runId);
  return useMutation({
    mutationFn: async (message?: string): Promise<JoinChallengeResult> => {
      const { data, error } = await supabase.rpc('join_challenge_run', {
        p_run_id: runId,
        p_message: message ?? null,
      });
      if (error) throw error;
      return data as JoinChallengeResult;
    },
    onSuccess: invalidate,
  });
}

export function useLeaveChallenge(runId: string | undefined) {
  const invalidate = useInvalidateChallenge(runId);
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('leave_challenge_run', { p_run_id: runId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Solicitações pendentes — só o criador enxerga (RLS garante). */
export function useChallengeJoinRequests(runId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['challenge-join-requests', runId] as const,
    enabled: Boolean(runId) && enabled,
    queryFn: async (): Promise<ChallengeJoinRequest[]> => {
      const { data, error } = await supabase
        .from('challenge_join_requests')
        .select(`id, requester_id, request_message, created_at, requester:requester_id(${PROFILE_COLUMNS})`)
        .eq('challenge_run_id', runId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ChallengeJoinRequest[];
    },
  });
}

export function useReviewChallengeRequest(runId: string | undefined) {
  const invalidate = useInvalidateChallenge(runId);
  return useMutation({
    mutationFn: async ({ requestId, approve }: { requestId: string; approve: boolean }) => {
      const { error } = await supabase.rpc(
        approve ? 'approve_challenge_join_request' : 'reject_challenge_join_request',
        { p_request_id: requestId },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Participantes — visíveis para o criador (RLS); os demais usam o ranking. */
export function useChallengeParticipants(runId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['challenge-participants', runId] as const,
    enabled: Boolean(runId) && enabled,
    queryFn: async (): Promise<ChallengeParticipantRow[]> => {
      const { data, error } = await supabase
        .from('challenge_participants')
        .select(`user_id, status, progress_percent, joined_at, profile:user_id(${PROFILE_COLUMNS})`)
        .eq('challenge_run_id', runId!)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ChallengeParticipantRow[];
    },
  });
}

export function useRemoveChallengeParticipant(runId: string | undefined) {
  const invalidate = useInvalidateChallenge(runId);
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('remove_challenge_participant', {
        p_run_id: runId,
        p_user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Abre/fecha inscrições ou encerra o desafio agora (end_at = agora). */
export function useUpdateChallengeAdmin(runId: string | undefined) {
  const invalidate = useInvalidateChallenge(runId);
  return useMutation({
    mutationFn: async (patch: { enrollment_closed?: boolean; end_at?: string }) => {
      const { error } = await supabase.from('challenge_runs').update(patch).eq('id', runId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
