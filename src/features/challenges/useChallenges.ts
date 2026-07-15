import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ChallengeRun, ChallengeTask, ChallengeTaskDraft } from './types';

export const CHALLENGE_COLUMNS =
  'id, creator_id, name, description, cover_image_url, category, start_at, end_at, status, access_audience, requires_creator_approval, enrollment_closed, participant_limit, participant_count, completion_threshold, rules_json, created_at';

export interface ChallengeInput {
  name: string;
  description: string;
  cover_image_url: string | null;
  category: string | null;
  start_at: string;
  end_at: string;
  visibility: 'public' | 'private';
  participant_limit: number | null;
  completion_threshold: number;
  rules_text: string;
}

function toRunRow(input: ChallengeInput) {
  return {
    name: input.name,
    description: input.description || null,
    cover_image_url: input.cover_image_url,
    category: input.category,
    start_at: input.start_at,
    end_at: input.end_at,
    // Público: qualquer um adere. Privado: descobrível, mas a entrada passa
    // pela aprovação do criador (modelo binário do backend).
    visibility: 'public',
    access_audience: input.visibility === 'private' ? 'invite_only' : 'public',
    requires_creator_approval: input.visibility === 'private',
    participant_limit: input.participant_limit,
    completion_threshold: input.completion_threshold,
    rules_json: input.rules_text ? { text: input.rules_text } : {},
    challenge_type: 'creator',
    creation_mode: 'social',
  };
}

/** Desafios que eu criei ou dos quais participo. */
export function useMyChallenges(userId: string | undefined) {
  return useQuery({
    queryKey: ['challenges', 'mine', userId] as const,
    enabled: Boolean(userId),
    queryFn: async (): Promise<ChallengeRun[]> => {
      if (!userId) return [];
      const [participations, owned] = await Promise.all([
        supabase.from('challenge_participants').select('challenge_run_id').eq('user_id', userId),
        supabase
          .from('challenge_runs')
          .select(CHALLENGE_COLUMNS)
          .eq('creator_id', userId)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false }),
      ]);
      if (participations.error) throw participations.error;
      if (owned.error) throw owned.error;

      const ownedRows = (owned.data ?? []) as ChallengeRun[];
      const ownedIds = new Set(ownedRows.map((row) => row.id));
      const joinedIds = (participations.data ?? [])
        .map((row) => row.challenge_run_id as string)
        .filter((id) => !ownedIds.has(id));

      let joinedRows: ChallengeRun[] = [];
      if (joinedIds.length > 0) {
        const { data, error } = await supabase
          .from('challenge_runs')
          .select(CHALLENGE_COLUMNS)
          .in('id', joinedIds)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false });
        if (error) throw error;
        joinedRows = (data ?? []) as ChallengeRun[];
      }
      return [...ownedRows, ...joinedRows];
    },
  });
}

/** Descoberta: desafios ativos e agendados, dos maiores para os menores. */
export function useDiscoverChallenges(search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: ['challenges', 'discover', term] as const,
    queryFn: async (): Promise<ChallengeRun[]> => {
      let query = supabase
        .from('challenge_runs')
        .select(CHALLENGE_COLUMNS)
        .in('status', ['active', 'scheduled'])
        .order('participant_count', { ascending: false })
        .limit(60);
      if (term) query = query.ilike('name', `%${term}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ChallengeRun[];
    },
  });
}

export function useChallengeTasks(runId: string | undefined) {
  return useQuery({
    queryKey: ['challenge-tasks', runId] as const,
    enabled: Boolean(runId),
    queryFn: async (): Promise<ChallengeTask[]> => {
      const { data, error } = await supabase
        .from('challenge_tasks')
        .select('id, challenge_run_id, name, frequency, target_count, is_required, requires_proof, position')
        .eq('challenge_run_id', runId!)
        .order('position');
      if (error) throw error;
      return (data ?? []) as ChallengeTask[];
    },
  });
}

async function saveTasks(runId: string, tasks: ChallengeTaskDraft[], existing: ChallengeTask[]) {
  const keptIds = new Set(tasks.filter((task) => task.id).map((task) => task.id!));
  const removed = existing.filter((task) => !keptIds.has(task.id)).map((task) => task.id);
  if (removed.length > 0) {
    const { error } = await supabase.from('challenge_tasks').delete().in('id', removed);
    if (error) throw error;
  }
  for (const [index, task] of tasks.entries()) {
    const row = {
      name: task.name,
      frequency: task.frequency,
      target_count: task.target_count,
      is_required: task.is_required,
      requires_proof: task.requires_proof,
      position: index,
    };
    if (task.id) {
      const { error } = await supabase.from('challenge_tasks').update(row).eq('id', task.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('challenge_tasks').insert({ ...row, challenge_run_id: runId });
      if (error) throw error;
    }
  }
}

export function useCreateChallenge(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, tasks }: { input: ChallengeInput; tasks: ChallengeTaskDraft[] }): Promise<ChallengeRun> => {
      if (!userId) throw new Error('missing-user');
      const { data, error } = await supabase
        .from('challenge_runs')
        .insert({ ...toRunRow(input), creator_id: userId })
        .select(CHALLENGE_COLUMNS)
        .single();
      if (error) throw error;
      const run = data as ChallengeRun;
      await saveTasks(run.id, tasks, []);
      return run;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['challenges'] }),
  });
}

export function useUpdateChallenge(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      tasks,
      existingTasks,
    }: {
      input: ChallengeInput;
      tasks: ChallengeTaskDraft[];
      existingTasks: ChallengeTask[];
    }): Promise<ChallengeRun> => {
      const { data, error } = await supabase
        .from('challenge_runs')
        .update(toRunRow(input))
        .eq('id', runId)
        .select(CHALLENGE_COLUMNS)
        .single();
      if (error) throw error;
      await saveTasks(runId, tasks, existingTasks);
      return data as ChallengeRun;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['challenge', runId], data);
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
      queryClient.invalidateQueries({ queryKey: ['challenge-tasks', runId] });
      queryClient.invalidateQueries({ queryKey: ['challenge-progress', runId] });
    },
  });
}

export function useDeleteChallenge(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('challenge_runs').delete().eq('id', runId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['challenge', runId] });
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
    },
  });
}
