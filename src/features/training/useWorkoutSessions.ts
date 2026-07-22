import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { localDateKey, todayKey } from '@/lib/localDate';

/**
 * Conclusão de treino PERSISTIDA (tabela `workout_sessions`, compartilhada com o
 * desktop; RLS já permite o aluno inserir/ler os próprios). É a fonte de verdade
 * do status "feito hoje" — o estado local do Player some ao recarregar.
 */
export interface TodayWorkoutSession {
  id: string;
  workoutId: string;
  completedAt: string;
  startedAt: string;
  exercisesDone: number | null;
  exercisesTotal: number | null;
  calories: number | null;
  durationMin: number | null;
}

type SessionRow = {
  id: string;
  workout_id: string;
  completed_at: string | null;
  started_at: string;
  exercises_completed_count: number | null;
  exercises_total_count: number | null;
  calories_logged: number | null;
};

const EMPTY = new Map<string, TodayWorkoutSession>();

function durationMinutes(started: string, completed: string): number | null {
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(1, Math.round(ms / 60_000));
}

/**
 * Sessões concluídas HOJE, indexadas por `workout_id` (a mais recente vence). O
 * card do dia usa isto para alternar entre "iniciar" e "concluído + dados".
 */
export function useTodayWorkoutSessions() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const query = useQuery({
    queryKey: ['workout-sessions', 'today', userId],
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnMount: 'always',
    queryFn: async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('id,workout_id,completed_at,started_at,exercises_completed_count,exercises_total_count,calories_logged')
        .eq('student_id', userId as string)
        .not('completed_at', 'is', null)
        .gte('completed_at', since.toISOString())
        .order('completed_at', { ascending: false });
      if (error) throw error;

      const byWorkoutId = new Map<string, TodayWorkoutSession>();
      for (const row of (data ?? []) as SessionRow[]) {
        if (!row.completed_at || localDateKey(row.completed_at) !== todayKey()) continue;
        if (byWorkoutId.has(row.workout_id)) continue; // ordenado desc → 1ª é a mais recente
        byWorkoutId.set(row.workout_id, {
          id: row.id,
          workoutId: row.workout_id,
          completedAt: row.completed_at,
          startedAt: row.started_at,
          exercisesDone: row.exercises_completed_count,
          exercisesTotal: row.exercises_total_count,
          calories: row.calories_logged,
          durationMin: durationMinutes(row.started_at, row.completed_at),
        });
      }
      return byWorkoutId;
    },
  });

  return { byWorkoutId: query.data ?? EMPTY, isLoading: query.isLoading };
}

export interface LogWorkoutSessionInput {
  workoutId: string;
  assignmentId?: string | null;
  startedAt: string;
  /** Fim da sessão; default = agora. Permite gravar o tempo total editado no resumo. */
  completedAt?: string;
  exercisesDone: number;
  exercisesTotal: number;
  calories?: number | null;
}

/** Grava uma sessão concluída. Sem workoutId real não persiste (só local). */
export function useLogWorkoutSession() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: LogWorkoutSessionInput) => {
      if (!userId || !input.workoutId) return;
      const { error } = await supabase.from('workout_sessions').insert({
        student_id: userId,
        workout_id: input.workoutId,
        student_workout_assignment_id: input.assignmentId ?? null,
        started_at: input.startedAt,
        completed_at: input.completedAt ?? new Date().toISOString(),
        exercises_completed_count: input.exercisesDone,
        exercises_total_count: input.exercisesTotal,
        calories_logged: input.calories ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workout-sessions', 'today', userId] });
    },
  });
}
