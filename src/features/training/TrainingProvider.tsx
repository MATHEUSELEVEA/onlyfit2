import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { localDateKey } from '@/lib/localDate';
import { DAY_CODES, uniqueWorkouts, useStudentWorkouts } from './useStudentWorkouts';

export type TrainingStatus = 'planned' | 'active' | 'partial' | 'completed' | 'missed' | 'imported' | 'rest';
export type TrainingSurface = 'strength' | 'running' | 'cycling' | 'walking' | 'swimming' | 'functional' | 'hiit' | 'yoga' | 'pilates' | 'other';
export type ActivitySource = 'onlyfit' | 'manual' | 'apple_health' | 'healthkit' | 'garmin' | 'strava' | 'coros' | 'fitbit';

export interface ExerciseSetLog { weight: number; reps: number; rpe: number | null; rir: number | null; completed: boolean; }
export interface WorkoutExercise {
  id: string;
  name: string;
  muscle: string;
  sets: number;
  targetReps: string;
  lastWeight: number;
  lastReps: number;
  technique: string;
  demoLabel: string;
  /** URL publicada pelo profissional/biblioteca. Sem URL não fingimos vídeo. */
  videoUrl?: string | null;
}
export interface WorkoutTemplate { id: string; title: string; focus: string; durationMin: number; exercises: WorkoutExercise[]; }
export interface ScheduledWorkout { id: string; date: string; templateId?: string; title: string; focus: string; durationMin: number; status: TrainingStatus; surface: TrainingSurface; summary?: string; canStart?: boolean; }
/** Boundary for wearable adapters. External data never becomes a prescribed workout. */
export interface ImportedActivity {
  id: string; date: string; title: string; durationMin: number; surface: TrainingSurface; source: ActivitySource;
  movingTimeMin?: number; externalId?: string; startedAt?: string; endedAt?: string; distanceKm?: number; calories?: number; averageHeartRate?: number; maxHeartRate?: number; averageSpeedKmh?: number; averagePowerW?: number; weightedPowerW?: number; elevationM?: number; trainingLoad?: number; rpe?: number; provider?: string; engine?: string; activityType?: string; sourcePayload?: Record<string, unknown>;
  importedFromWatch?: boolean;
}
export interface WorkoutSession { id: string; scheduledId: string; templateId: string; startedAt: number; activeExercise: number; logs: Record<string, ExerciseSetLog[]>; note: string; }

interface TrainingContextValue {
  templates: WorkoutTemplate[];
  scheduled: ScheduledWorkout[];
  imported: ImportedActivity[];
  addActivity: (activity: Omit<ImportedActivity, 'id'>) => void;
  activeSession: WorkoutSession | null;
  startSession: (scheduledId: string) => void;
  toggleSet: (exerciseId: string, setIndex: number) => void;
  updateSet: (exerciseId: string, setIndex: number, values: Partial<Pick<ExerciseSetLog, 'weight' | 'reps' | 'rpe' | 'rir'>>) => void;
  setActiveExercise: (index: number) => void;
  updateSessionNote: (note: string) => void;
  completeSession: () => void;
  reschedule: (scheduledId: string) => void;
  startWorkoutNow: (template: WorkoutTemplate, surface: TrainingSurface) => boolean;
  skipToday: (scheduledId: string) => void;
}

const TrainingContext = createContext<TrainingContextValue | null>(null);
const day = (offset: number) => { const date = new Date(); date.setDate(date.getDate() + offset); return localDateKey(date); };

function createSession(scheduledId: string, template: WorkoutTemplate): WorkoutSession {
  return {
    id: `session-${scheduledId}`,
    scheduledId,
    templateId: template.id,
    startedAt: Date.now(),
    activeExercise: 0,
    note: '',
    logs: Object.fromEntries(template.exercises.map((exercise) => [
      exercise.id,
      Array.from({ length: exercise.sets }, () => ({
        weight: exercise.lastWeight,
        reps: Number(exercise.targetReps.match(/\d+/)?.[0] ?? 10),
        rpe: null,
        rir: null,
        completed: false,
      })),
    ])),
  };
}

export function TrainingProvider({ children }: { children: ReactNode }) {
  const { workouts } = useStudentWorkouts();
  const sourceWorkouts = useMemo(() => uniqueWorkouts(workouts), [workouts]);
  const realTemplates = useMemo<WorkoutTemplate[]>(() => sourceWorkouts.map((workout) => {
    const exercises = workout.exercises.map((exercise, index) => {
      const name = exercise.studentDisplayName || exercise.exerciseName || `Exercício ${index + 1}`;
      return {
        id: exercise.id,
        name,
        muscle: exercise.muscleGroup || 'Exercício',
        sets: exercise.sets,
        targetReps: exercise.reps,
        lastWeight: 0,
        lastReps: Number(exercise.reps.match(/\d+/)?.[0] ?? 10),
        technique: exercise.notes || exercise.tempoNotes || '',
        demoLabel: name,
        videoUrl: exercise.videoUrl,
      };
    });
    const muscles = [...new Set(exercises.map((exercise) => exercise.muscle).filter((muscle) => muscle !== 'Exercício'))];
    return {
      id: `library-${workout.workoutId ?? workout.assignmentId}`,
      title: workout.title,
      focus: muscles.slice(0, 3).join(' · ') || workout.prescription?.session.objective || '',
      durationMin: Math.max(0, Math.round(exercises.reduce((total, exercise) => total + exercise.sets, 0) * 2.5)),
      exercises,
    };
  }), [sourceWorkouts]);
  const realScheduled = useMemo<ScheduledWorkout[]>(() => {
    const current = new Date();
    const todayCode = DAY_CODES[current.getDay()];
    const date = localDateKey(current);
    return workouts
      .filter((workout) => workout.daysOfWeek.includes(todayCode))
      .filter((workout) => !workout.startsAt || workout.startsAt.slice(0, 10) <= date)
      .filter((workout) => !workout.endsAt || workout.endsAt.slice(0, 10) >= date)
      .map((workout) => {
        const templateId = `library-${workout.workoutId ?? workout.assignmentId}`;
        const template = realTemplates.find((item) => item.id === templateId);
        return {
          id: workout.assignmentId,
          date,
          templateId,
          title: workout.title,
          focus: template?.focus || workout.prescription?.session.objective || '',
          durationMin: template?.durationMin || 0,
          status: 'planned',
          surface: workout.trainingType,
          canStart: Boolean(template?.exercises.length),
        };
      });
  }, [realTemplates, workouts]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledWorkout[]>([]);
  const [imported, setImported] = useState<ImportedActivity[]>([]);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  // React Query is the external source; keep the session-capable local projection in sync.
  // Só atualiza se o conteúdo mudou — evita loop quando a dependência vem com nova referência.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setTemplates((current) => {
      if (
        current.length === realTemplates.length
        && current.every((item, index) => {
          const next = realTemplates[index];
          return item.id === next?.id
            && item.title === next.title
            && item.exercises.length === next.exercises.length;
        })
      ) {
        return current;
      }
      return realTemplates;
    });
  }, [realTemplates]);
  // Preserve transient session status while refreshing the server-backed schedule.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setScheduled((current) => {
      const next = realScheduled.map((item) => {
        const existing = current.find((entry) => entry.id === item.id);
        return existing && existing.status !== 'planned'
          ? { ...item, status: existing.status, summary: existing.summary }
          : item;
      });
      if (
        current.length === next.length
        && current.every((item, index) => {
          const candidate = next[index];
          return item.id === candidate?.id
            && item.status === candidate.status
            && item.date === candidate.date
            && item.templateId === candidate.templateId;
        })
      ) {
        return current;
      }
      return next;
    });
  }, [realScheduled]);
  const startSession = (scheduledId: string) => {
    const item = scheduled.find((entry) => entry.id === scheduledId); const template = templates.find((entry) => entry.id === item?.templateId);
    if (!item || !template || !template.exercises.length) return;
    if (activeSession && activeSession.scheduledId !== scheduledId) return;
    if (activeSession?.scheduledId === scheduledId) return;
    setActiveSession(createSession(scheduledId, template));
    setScheduled((current) => current.map((entry) => entry.id === scheduledId ? { ...entry, status: 'active' } : entry));
  };
  const startWorkoutNow = (template: WorkoutTemplate, surface: TrainingSurface) => {
    if (!template.exercises.length) return false;
    const scheduledId = `${template.id}-${day(0)}`;
    if (activeSession && activeSession.scheduledId !== scheduledId) return false;
    if (activeSession?.scheduledId === scheduledId) return true;

    setTemplates((current) => current.some((entry) => entry.id === template.id)
      ? current.map((entry) => entry.id === template.id ? template : entry)
      : [...current, template]);
    setScheduled((current) => {
      const scheduledWorkout: ScheduledWorkout = {
        id: scheduledId,
        date: day(0),
        templateId: template.id,
        title: template.title,
        focus: template.focus,
        durationMin: template.durationMin,
        status: 'active',
        surface,
      };
      return current.some((entry) => entry.id === scheduledId)
        ? current.map((entry) => entry.id === scheduledId ? scheduledWorkout : entry)
        : [...current, scheduledWorkout];
    });
    setActiveSession(createSession(scheduledId, template));
    return true;
  };
  const toggleSet = (exerciseId: string, setIndex: number) => setActiveSession((current) => {
    if (!current) return current;
    const currentSet = current.logs[exerciseId][setIndex];
    const completing = !currentSet.completed;
    return {
      ...current,
      logs: {
        ...current.logs,
        [exerciseId]: current.logs[exerciseId].map((set, index) => {
          if (index === setIndex) return { ...set, completed: !set.completed };
          // A série seguinte herda a carga e as repetições digitadas agora.
          // Isso evita o retorno ao valor padrão a cada conclusão.
          if (completing && index === setIndex + 1 && !set.completed) {
            return { ...set, weight: currentSet.weight, reps: currentSet.reps };
          }
          return set;
        }),
      },
    };
  });
  const updateSet = (exerciseId: string, setIndex: number, values: Partial<Pick<ExerciseSetLog, 'weight' | 'reps' | 'rpe' | 'rir'>>) => setActiveSession((current) => current ? { ...current, logs: { ...current.logs, [exerciseId]: current.logs[exerciseId].map((set, index) => index === setIndex ? { ...set, ...values } : set) } } : current);
  const setActiveExercise = (activeExercise: number) => setActiveSession((current) => current ? { ...current, activeExercise } : current);
  const updateSessionNote = (note: string) => setActiveSession((current) => current ? { ...current, note } : current);
  const completeSession = () => {
    if (!activeSession) return;
    setScheduled((current) => current.map((entry) => entry.id === activeSession.scheduledId ? { ...entry, status: 'completed' } : entry));
    setActiveSession(null);
  };
  const reschedule = (scheduledId: string) => setScheduled((current) => current.map((entry) => entry.id === scheduledId ? { ...entry, date: day(0), status: 'planned' } : entry));
  const skipToday = (scheduledId: string) => setScheduled((current) => current.map((entry) => entry.id === scheduledId && entry.status === 'planned'
    ? { ...entry, status: 'missed' }
    : entry));
  const addActivity = (activity: Omit<ImportedActivity, 'id'>) => setImported((current) => [{ ...activity, id: `activity-${Date.now()}` }, ...current]);
  const value = { templates, scheduled, imported, addActivity, activeSession, startSession, toggleSet, updateSet, setActiveExercise, updateSessionNote, completeSession, reschedule, startWorkoutNow, skipToday };
  return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTraining() { const context = useContext(TrainingContext); if (!context) throw new Error('useTraining must be used within TrainingProvider'); return context; }
