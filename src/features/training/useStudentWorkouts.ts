import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/** Códigos de dia usados por student_workout_assignments.days_of_week. */
export const DAY_CODES = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'] as const;

export type WorkoutTrainingType = 'strength' | 'running' | 'cycling' | 'walking' | 'swimming' | 'functional' | 'hiit' | 'yoga' | 'pilates' | 'other';

/** Um treino aplicado pelo profissional (assignment + workout). */
export interface StudentWorkout {
  assignmentId: string;
  workoutId: string | null;
  title: string;
  daysOfWeek: string[];
  startsAt: string | null;
  endsAt: string | null;
  exerciseCount: number;
  trainingType: WorkoutTrainingType;
}

type AssignmentRow = {
  id: string;
  days_of_week: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
  workout: {
    id: string;
    title: string | null;
    student_display_name: string | null;
    category: string | null;
    workout_exercises: { count: number }[] | null;
  } | null;
};

/**
 * `workouts.category` nasceu como objetivo do treino (ex.: Hipertrofia), não
 * como uma taxonomia rígida de modalidade. Categorias antigas do builder são
 * treinos de força; só promovemos para outro grupo quando o valor declara essa
 * modalidade de forma inequívoca.
 */
export function workoutTrainingType(category: string | null | undefined): WorkoutTrainingType {
  const value = (category ?? '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/corrida|running/.test(value)) return 'running';
  if (/ciclismo|cycling|bike/.test(value)) return 'cycling';
  if (/caminhada|walking/.test(value)) return 'walking';
  if (/natacao|swimming/.test(value)) return 'swimming';
  if (/funcional|functional/.test(value)) return 'functional';
  if (/\bhiit\b/.test(value)) return 'hiit';
  if (/\byoga\b/.test(value)) return 'yoga';
  if (/pilates/.test(value)) return 'pilates';
  return 'strength';
}

function toStudentWorkout(row: AssignmentRow): StudentWorkout {
  return {
    assignmentId: row.id,
    workoutId: row.workout?.id ?? null,
    title: row.workout?.student_display_name || row.workout?.title || 'Treino',
    daysOfWeek: row.days_of_week ?? [],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    exerciseCount: row.workout?.workout_exercises?.[0]?.count ?? 0,
    trainingType: workoutTrainingType(row.workout?.category),
  };
}

/**
 * Treinos ativos aplicados ao aluno pelo profissional. Fonte real (RLS garante
 * que o aluno só lê os próprios assignments). O Player e o histórico de sessões
 * são um passo à parte; aqui expomos a biblioteca e o agendamento por dia.
 */
export function useStudentWorkouts() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const query = useQuery({
    queryKey: ['student-workouts', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<StudentWorkout[]> => {
      const { data, error } = await supabase
        .from('student_workout_assignments')
        .select('id,days_of_week,starts_at,ends_at,workout:workouts(id,title,student_display_name,category,workout_exercises(count))')
        .eq('student_user_id', userId as string)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as AssignmentRow[]).map(toStudentWorkout);
    },
  });

  return { workouts: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

const dayIndex = (code: string) => DAY_CODES.indexOf(code as typeof DAY_CODES[number]);

/**
 * Biblioteca: um card por treino, deduplicado por título e com todos os dias em
 * que ele é aplicado agregados. O mesmo treino costuma ser prescrito como uma
 * atribuição por dia da semana; sem isso a lista repetiria o mesmo card N vezes.
 */
export function uniqueWorkouts(workouts: StudentWorkout[]): StudentWorkout[] {
  const byTitle = new Map<string, StudentWorkout>();
  for (const workout of workouts) {
    const key = `${workout.trainingType}:${workout.title.trim().toLowerCase()}`;
    const existing = byTitle.get(key);
    if (existing) {
      existing.daysOfWeek = [...new Set([...existing.daysOfWeek, ...workout.daysOfWeek])].sort((a, b) => dayIndex(a) - dayIndex(b));
      existing.exerciseCount = Math.max(existing.exerciseCount, workout.exerciseCount);
    } else {
      byTitle.set(key, { ...workout, daysOfWeek: [...new Set(workout.daysOfWeek)].sort((a, b) => dayIndex(a) - dayIndex(b)) });
    }
  }
  return [...byTitle.values()];
}
