import { createContext, useContext, useState, type ReactNode } from 'react';

export type TrainingStatus = 'planned' | 'active' | 'partial' | 'completed' | 'missed' | 'imported' | 'rest';
export type TrainingSurface = 'strength' | 'running' | 'cycling' | 'walking' | 'swimming' | 'functional' | 'hiit' | 'yoga' | 'pilates' | 'other';
export type ActivitySource = 'onlyfit' | 'manual' | 'apple_health' | 'garmin' | 'strava' | 'coros' | 'fitbit';

export interface ExerciseSetLog { weight: number; reps: number; rpe: number | null; rir: number | null; completed: boolean; }
export interface WorkoutExercise { id: string; name: string; muscle: string; sets: number; targetReps: string; lastWeight: number; technique: string; demoLabel: string; }
export interface WorkoutTemplate { id: string; title: string; focus: string; durationMin: number; exercises: WorkoutExercise[]; }
export interface ScheduledWorkout { id: string; date: string; templateId?: string; title: string; focus: string; durationMin: number; status: TrainingStatus; surface: TrainingSurface; summary?: string; }
/** Boundary for future HealthKit/wearable adapters. External data never becomes a prescribed workout. */
export interface ImportedActivity {
  id: string; date: string; title: string; durationMin: number; surface: TrainingSurface; source: ActivitySource;
  externalId?: string; startedAt?: string; distanceKm?: number; calories?: number; averageHeartRate?: number; elevationM?: number;
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
}

const TrainingContext = createContext<TrainingContextValue | null>(null);
const day = (offset: number) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); };

const templates: WorkoutTemplate[] = [{
  id: 'upper', title: 'Superior A', focus: 'Peito · costas · ombros', durationMin: 58,
  exercises: [
    { id: 'supino', name: 'Supino reto', muscle: 'Peito', sets: 4, targetReps: '8–10', lastWeight: 60, technique: 'Escápulas firmes e pés no chão.', demoLabel: 'Posição e trajetória da barra' },
    { id: 'remada', name: 'Remada baixa', muscle: 'Costas', sets: 4, targetReps: '10–12', lastWeight: 48, technique: 'Puxe com os cotovelos, sem elevar os ombros.', demoLabel: 'Controle da puxada e escápulas' },
    { id: 'desenvolvimento', name: 'Desenvolvimento', muscle: 'Ombros', sets: 3, targetReps: '8–10', lastWeight: 18, technique: 'Controle a descida e mantenha o tronco estável.', demoLabel: 'Estabilidade do tronco' },
  ],
}];

const initialScheduled: ScheduledWorkout[] = [
  { id: 'yesterday', date: day(-1), templateId: 'upper', title: 'Superior A', focus: 'Peito · costas · ombros', durationMin: 58, status: 'completed', surface: 'strength', summary: '58 min · concluído' },
  { id: 'today', date: day(0), templateId: 'upper', title: 'Superior A', focus: 'Peito · costas · ombros', durationMin: 58, status: 'planned', surface: 'strength' },
  { id: 'tomorrow', date: day(1), templateId: 'upper', title: 'Inferior B', focus: 'Quadríceps · posterior', durationMin: 62, status: 'planned', surface: 'strength' },
  { id: 'missed', date: day(-3), templateId: 'upper', title: 'Superior A', focus: 'Peito · costas', durationMin: 55, status: 'missed', surface: 'strength' },
  { id: 'partial', date: day(-4), templateId: 'upper', title: 'Inferior B', focus: 'Quadríceps · posterior', durationMin: 62, status: 'partial', surface: 'strength', summary: '24 min · sessão parcial' },
  { id: 'rest', date: day(2), title: 'Descanso', focus: 'Recuperação', durationMin: 0, status: 'rest', surface: 'strength' },
];

const initialImported: ImportedActivity[] = [{ id: 'run', date: day(-2), title: 'Corrida ao ar livre', durationMin: 34, surface: 'running', source: 'apple_health', externalId: 'healthkit-demo-run-01', distanceKm: 5.2, averageHeartRate: 146 }];

export function TrainingProvider({ children }: { children: ReactNode }) {
  const [scheduled, setScheduled] = useState(initialScheduled);
  const [imported, setImported] = useState(initialImported);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const startSession = (scheduledId: string) => {
    const item = scheduled.find((entry) => entry.id === scheduledId); const template = templates.find((entry) => entry.id === item?.templateId);
    if (!item || !template) return;
    if (activeSession?.scheduledId === scheduledId) return;
    setActiveSession({ id: `session-${scheduledId}`, scheduledId, templateId: template.id, startedAt: Date.now(), activeExercise: 0, note: '', logs: Object.fromEntries(template.exercises.map((exercise) => [exercise.id, Array.from({ length: exercise.sets }, () => ({ weight: exercise.lastWeight, reps: Number(exercise.targetReps.match(/\d+/)?.[0] ?? 10), rpe: null, rir: null, completed: false }))])) });
    setScheduled((current) => current.map((entry) => entry.id === scheduledId ? { ...entry, status: 'active' } : entry));
  };
  const toggleSet = (exerciseId: string, setIndex: number) => setActiveSession((current) => current ? { ...current, logs: { ...current.logs, [exerciseId]: current.logs[exerciseId].map((set, index) => index === setIndex ? { ...set, completed: !set.completed } : set) } } : current);
  const updateSet = (exerciseId: string, setIndex: number, values: Partial<Pick<ExerciseSetLog, 'weight' | 'reps' | 'rpe' | 'rir'>>) => setActiveSession((current) => current ? { ...current, logs: { ...current.logs, [exerciseId]: current.logs[exerciseId].map((set, index) => index === setIndex ? { ...set, ...values } : set) } } : current);
  const setActiveExercise = (activeExercise: number) => setActiveSession((current) => current ? { ...current, activeExercise } : current);
  const updateSessionNote = (note: string) => setActiveSession((current) => current ? { ...current, note } : current);
  const completeSession = () => {
    if (!activeSession) return;
    setScheduled((current) => current.map((entry) => entry.id === activeSession.scheduledId ? { ...entry, status: 'completed', summary: 'Concluído agora · sessão registrada' } : entry));
    setActiveSession(null);
  };
  const reschedule = (scheduledId: string) => setScheduled((current) => current.map((entry) => entry.id === scheduledId ? { ...entry, date: day(0), status: 'planned' } : entry));
  const addActivity = (activity: Omit<ImportedActivity, 'id'>) => setImported((current) => [{ ...activity, id: `activity-${Date.now()}` }, ...current]);
  const value = { templates, scheduled, imported, addActivity, activeSession, startSession, toggleSet, updateSet, setActiveExercise, updateSessionNote, completeSession, reschedule };
  return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTraining() { const context = useContext(TrainingContext); if (!context) throw new Error('useTraining must be used within TrainingProvider'); return context; }
