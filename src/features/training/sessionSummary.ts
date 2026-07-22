import type { StepRole } from './guidedSession';
import type { GuidedSessionSummary } from './useWorkoutSessions';

/** Passo do resumo na unidade nativa: tempo em s, distância em m, reps em reps. */
export type ReviewBy = 'time' | 'distance' | 'reps';
export interface ReviewStep {
  label: string;
  role: StepRole;
  by: ReviewBy;
  meta: number;
  realized: number;
  /** Tempo medido do passo (splits/checks) — mantém o relógio quando a unidade é m/reps. */
  realizedSec: number;
}

/** Monta o summary persistido em workout_sessions.summary (função pura, testável). */
export function buildSessionSummary(model: { sport: string; steps: ReviewStep[] }): GuidedSessionSummary {
  const distance = model.steps.filter((step) => step.by === 'distance');
  const reps = model.steps.filter((step) => step.by === 'reps');
  return {
    version: 1,
    sport: model.sport,
    ...(distance.length ? { totalMeters: distance.reduce((acc, step) => acc + step.realized, 0) } : {}),
    ...(reps.length ? { totalReps: reps.reduce((acc, step) => acc + step.realized, 0) } : {}),
    steps: model.steps.map(({ label, by, meta, realized }) => ({ label, by, meta, realized })),
  };
}
