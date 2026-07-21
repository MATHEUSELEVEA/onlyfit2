import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { WorkoutPrescription } from '@/features/profile/offerings/workoutPrescription';

/** Códigos de dia usados por student_workout_assignments.days_of_week. */
export const DAY_CODES = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'] as const;

export type WorkoutTrainingType = 'strength' | 'running' | 'cycling' | 'walking' | 'swimming' | 'functional' | 'hiit' | 'yoga' | 'pilates' | 'other';

export interface StudentWorkoutExercise {
  id: string;
  exerciseName: string | null;
  studentDisplayName: string | null;
  muscleGroup: string | null;
  sets: number;
  reps: string;
  notes: string | null;
  tempoNotes: string | null;
  videoUrl: string | null;
  position: number | null;
}

/** Um treino aplicado pelo profissional (assignment + workout). */
export interface StudentWorkout {
  assignmentId: string;
  workoutId: string | null;
  title: string;
  daysOfWeek: string[];
  /** Semanas do mesociclo em que este treino aparece (protocolo multi-semana). */
  weeks: number[];
  startsAt: string | null;
  endsAt: string | null;
  exerciseCount: number;
  exercises: StudentWorkoutExercise[];
  trainingType: WorkoutTrainingType;
  prescription: WorkoutPrescription | null;
}

type AssignmentRow = {
  id: string;
  days_of_week: string[] | null;
  week_number: number | null;
  starts_at: string | null;
  ends_at: string | null;
  protocol_starts_at: string | null;
  workout: {
    id: string;
    title: string | null;
    student_display_name: string | null;
    category: string | null;
    workout_exercises: Array<{
      id: string;
      exercise_name: string | null;
      student_display_name: string | null;
      muscle_group: string | null;
      sets: number | null;
      reps: string | null;
      notes: string | null;
      tempo_notes: string | null;
      pro_video_url: string | null;
      position: number | null;
    }> | null;
    workout_prescriptions: Array<{
      modality: WorkoutTrainingType;
      prescription: WorkoutPrescription;
    }> | { modality: WorkoutTrainingType; prescription: WorkoutPrescription } | null;
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
  if (/outro|other/.test(value)) return 'other';
  return 'strength';
}

function toStudentWorkout(row: AssignmentRow): StudentWorkout {
  const rawPrescription = row.workout?.workout_prescriptions;
  const prescriptionRow = Array.isArray(rawPrescription) ? rawPrescription[0] : rawPrescription;
  const exercises = (row.workout?.workout_exercises ?? [])
    .map((exercise) => ({
      id: exercise.id,
      exerciseName: exercise.exercise_name,
      studentDisplayName: exercise.student_display_name,
      muscleGroup: exercise.muscle_group,
      sets: Math.max(1, exercise.sets ?? 1),
      reps: exercise.reps?.trim() || '10',
      notes: exercise.notes,
      tempoNotes: exercise.tempo_notes,
      videoUrl: exercise.pro_video_url,
      position: exercise.position,
    }))
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));
  return {
    assignmentId: row.id,
    workoutId: row.workout?.id ?? null,
    title: row.workout?.student_display_name || row.workout?.title || 'Treino',
    daysOfWeek: row.days_of_week ?? [],
    weeks: typeof row.week_number === 'number' ? [row.week_number] : [],
    startsAt: row.starts_at ?? row.protocol_starts_at,
    endsAt: row.ends_at,
    exerciseCount: exercises.length,
    exercises,
    trainingType: prescriptionRow?.modality ?? workoutTrainingType(row.workout?.category),
    prescription: prescriptionRow?.prescription ?? null,
  };
}

/** Referência estável para o fallback sem dados — evita `[]` novo a cada render. */
const EMPTY_WORKOUTS: StudentWorkout[] = [];

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
        .select('id,days_of_week,week_number,starts_at,ends_at,protocol_starts_at,workout:workouts(id,title,student_display_name,category,workout_exercises(id,exercise_name,student_display_name,muscle_group,sets,reps,notes,tempo_notes,pro_video_url,position),workout_prescriptions(modality,prescription))')
        .eq('student_user_id', userId as string)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as AssignmentRow[]).map(toStudentWorkout);
    },
  });

  return { workouts: query.data ?? EMPTY_WORKOUTS, isLoading: query.isLoading, error: query.error };
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
      existing.weeks = [...new Set([...existing.weeks, ...workout.weeks])].sort((a, b) => a - b);
      existing.exerciseCount = Math.max(existing.exerciseCount, workout.exerciseCount);
      if (workout.exercises.length > existing.exercises.length) existing.exercises = workout.exercises;
    } else {
      byTitle.set(key, {
        ...workout,
        daysOfWeek: [...new Set(workout.daysOfWeek)].sort((a, b) => dayIndex(a) - dayIndex(b)),
        weeks: [...new Set(workout.weeks)].sort((a, b) => a - b),
      });
    }
  }
  return [...byTitle.values()];
}
