import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { localDateKey } from '@/lib/localDate';
import { DAY_CODES, useStudentWorkouts } from './useStudentWorkouts';
import type { GuidedWorkout } from './guidedSession';
import { workoutExerciseCount, workoutTemplate } from './executableWorkout';

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
  /** Como executar (da biblioteca de exercícios). */
  instructions?: string | null;
}
export interface WorkoutTemplate { id: string; title: string; focus: string; durationMin: number; exercises: WorkoutExercise[]; }
export interface ScheduledWorkout { id: string; date: string; templateId?: string; workoutId?: string | null; assignmentId?: string; title: string; focus: string; durationMin: number; status: TrainingStatus; surface: TrainingSurface; summary?: string; canStart?: boolean; }
/** Boundary for wearable adapters. External data never becomes a prescribed workout. */
export interface ImportedActivity {
  id: string; date: string; title: string; durationMin: number; surface: TrainingSurface; source: ActivitySource;
  movingTimeMin?: number; externalId?: string; startedAt?: string; endedAt?: string; distanceKm?: number; calories?: number; averageHeartRate?: number; maxHeartRate?: number; averageSpeedKmh?: number; averagePowerW?: number; weightedPowerW?: number; elevationM?: number; trainingLoad?: number; rpe?: number; provider?: string; engine?: string; activityType?: string; sourcePayload?: Record<string, unknown>;
  importedFromWatch?: boolean;
}
export interface WorkoutSession { id: string; scheduledId: string; templateId: string; startedAt: number; activeExercise: number; logs: Record<string, ExerciseSetLog[]>; note: string; }
/** Sessão guiada (esportes não-musculação): o plano executável já resolvido + metadados p/ o check. */
export interface ActiveGuidedSession {
  scheduledId: string;
  workoutId: string | null;
  assignmentId?: string;
  title: string;
  surface: TrainingSurface;
  plan: GuidedWorkout;
  startedAt: number;
}

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
  activeGuided: ActiveGuidedSession | null;
  startGuided: (input: Omit<ActiveGuidedSession, 'startedAt'>) => void;
  completeGuided: () => void;
  cancelGuided: () => void;
}

const TrainingContext = createContext<TrainingContextValue | null>(null);
const day = (offset: number) => { const date = new Date(); date.setDate(date.getDate() + offset); return localDateKey(date); };

function currentWeekFromStart(startsAt: string | null, date: string): number {
  if (!startsAt) return 1;
  const start = new Date(`${startsAt.slice(0, 10)}T12:00:00`);
  const current = new Date(`${date}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) return 1;
  const diffDays = Math.floor((current.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

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
  const realTemplates = useMemo<WorkoutTemplate[]>(() => workouts.map(workoutTemplate), [workouts]);
  const realScheduled = useMemo<ScheduledWorkout[]>(() => {
    const current = new Date();
    const todayCode = DAY_CODES[current.getDay()];
    const date = localDateKey(current);
    const matches = workouts
      .filter((workout) => workout.daysOfWeek.includes(todayCode))
      .filter((workout) => !workout.weeks.length || workout.weeks.includes(currentWeekFromStart(workout.startsAt, date)))
      .filter((workout) => !workout.startsAt || workout.startsAt.slice(0, 10) <= date)
      .filter((workout) => !workout.endsAt || workout.endsAt.slice(0, 10) >= date);
    // Deduplica: o mesmo treino costuma ser prescrito em várias semanas/dias do
    // mesociclo; sem isto o mesmo card se repetia no dia. Chave = treino real
    // (workoutId) ou, na falta, tipo+título.
    const byWorkout = new Map<string, ScheduledWorkout>();
    for (const workout of matches) {
      const key = workout.workoutId ?? `${workout.trainingType}:${workout.title.trim().toLowerCase()}`;
      if (byWorkout.has(key)) continue;
      const templateId = `library-${workout.workoutId ?? workout.assignmentId}`;
      const template = realTemplates.find((item) => item.id === templateId);
      byWorkout.set(key, {
        id: workout.assignmentId,
        date,
        templateId,
        workoutId: workout.workoutId,
        assignmentId: workout.assignmentId,
        title: workout.title,
        focus: template?.focus || workout.prescription?.session.objective || '',
        durationMin: template?.durationMin || 0,
        status: 'planned',
        surface: workout.trainingType,
        canStart: workoutExerciseCount(workout) > 0,
      });
    }
    return [...byWorkout.values()];
  }, [realTemplates, workouts]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledWorkout[]>([]);
  const [imported, setImported] = useState<ImportedActivity[]>([]);
  const [activeSessions, setActiveSessions] = useState<Record<string, WorkoutSession>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSession = activeSessionId ? activeSessions[activeSessionId] ?? null : null;
  // React Query is the external source; keep the session-capable local projection in sync.
  // Só atualiza se o conteúdo mudou — evita loop quando a dependência vem com nova referência.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync de store externo (React Query) com override local; guardado por comparação de conteúdo.
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
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync de store externo (React Query) preservando status de sessão local; guardado por comparação de conteúdo.
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
    const sessionId = `session-${scheduledId}`;
    setActiveSessions((current) => current[sessionId] ? current : { ...current, [sessionId]: createSession(scheduledId, template) });
    setActiveSessionId(sessionId);
    setScheduled((current) => current.map((entry) => entry.id === scheduledId ? { ...entry, status: 'active' } : entry));
  };
  const startWorkoutNow = (template: WorkoutTemplate, surface: TrainingSurface) => {
    if (!template.exercises.length) return false;
    const scheduledId = `${template.id}-${day(0)}`;

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
    const sessionId = `session-${scheduledId}`;
    setActiveSessions((current) => current[sessionId] ? current : { ...current, [sessionId]: createSession(scheduledId, template) });
    setActiveSessionId(sessionId);
    return true;
  };
  const toggleSet = (exerciseId: string, setIndex: number) => setActiveSessions((sessions) => {
    if (!activeSessionId) return sessions;
    const current = sessions[activeSessionId];
    if (!current) return sessions;
    const currentSet = current.logs[exerciseId][setIndex];
    const completing = !currentSet.completed;
    return {
      ...sessions,
      [activeSessionId]: {
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
      },
    };
  });
  const updateSet = (exerciseId: string, setIndex: number, values: Partial<Pick<ExerciseSetLog, 'weight' | 'reps' | 'rpe' | 'rir'>>) => setActiveSessions((sessions) => activeSessionId && sessions[activeSessionId] ? { ...sessions, [activeSessionId]: { ...sessions[activeSessionId], logs: { ...sessions[activeSessionId].logs, [exerciseId]: sessions[activeSessionId].logs[exerciseId].map((set, index) => index === setIndex ? { ...set, ...values } : set) } } } : sessions);
  const setActiveExercise = (activeExercise: number) => setActiveSessions((sessions) => activeSessionId && sessions[activeSessionId] ? { ...sessions, [activeSessionId]: { ...sessions[activeSessionId], activeExercise } } : sessions);
  const updateSessionNote = (note: string) => setActiveSessions((sessions) => activeSessionId && sessions[activeSessionId] ? { ...sessions, [activeSessionId]: { ...sessions[activeSessionId], note } } : sessions);
  const completeSession = () => {
    if (!activeSession) return;
    setScheduled((current) => current.map((entry) => entry.id === activeSession.scheduledId ? { ...entry, status: 'completed' } : entry));
    setActiveSessions((current) => {
      const next = { ...current };
      delete next[activeSession.id];
      return next;
    });
    setActiveSessionId(null);
  };
  const reschedule = (scheduledId: string) => setScheduled((current) => current.map((entry) => entry.id === scheduledId ? { ...entry, date: day(0), status: 'planned' } : entry));
  const skipToday = (scheduledId: string) => setScheduled((current) => current.map((entry) => entry.id === scheduledId && entry.status === 'planned'
    ? { ...entry, status: 'missed' }
    : entry));
  const addActivity = (activity: Omit<ImportedActivity, 'id'>) => setImported((current) => [{ ...activity, id: `activity-${Date.now()}` }, ...current]);
  const [activeGuided, setActiveGuided] = useState<ActiveGuidedSession | null>(null);
  const startGuided = (input: Omit<ActiveGuidedSession, 'startedAt'>) => {
    setActiveGuided({ ...input, startedAt: Date.now() });
    setScheduled((current) => current.map((entry) => entry.id === input.scheduledId ? { ...entry, status: 'active' } : entry));
  };
  const completeGuided = () => {
    if (activeGuided) {
      setScheduled((current) => current.map((entry) => entry.id === activeGuided.scheduledId ? { ...entry, status: 'completed' } : entry));
    }
    setActiveGuided(null);
  };
  const cancelGuided = () => setActiveGuided(null);
  const value = { templates, scheduled, imported, addActivity, activeSession, startSession, toggleSet, updateSet, setActiveExercise, updateSessionNote, completeSession, reschedule, startWorkoutNow, skipToday, activeGuided, startGuided, completeGuided, cancelGuided };
  return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTraining() { const context = useContext(TrainingContext); if (!context) throw new Error('useTraining must be used within TrainingProvider'); return context; }
