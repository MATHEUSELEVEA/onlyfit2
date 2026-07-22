import type { WorkoutPrescription, PrescriptionBlock } from '@/features/profile/offerings/workoutPrescription';
import type { StudentWorkout, StudentWorkoutExercise, WorkoutTrainingType } from './useStudentWorkouts';

/**
 * Modelo do "passo executável" — a espinha dorsal do player guiado por esporte.
 * Calibrado para o público geral (esforço-primeiro; número é opcional). Um treino
 * é uma lista ordenada de passos; cada passo dura por tempo/distância/reps/aberto,
 * tem um alvo de esforço e um papel. Blocos `repeat` cobrem "6× (forte + recuperar)".
 * Roda 100% no celular; wearable só enriquece o realizado depois.
 */

export type StepBound =
  | { by: 'time'; seconds: number }
  | { by: 'distance'; meters: number }
  | { by: 'reps'; reps: number }
  | { by: 'open' };

export type Effort = 'easy' | 'moderate' | 'hard' | 'max' | 'recover';
export type StepRole = 'warmup' | 'activation' | 'main' | 'recovery' | 'cooldown';
export type SwimStroke = 'free' | 'back' | 'breast' | 'fly' | 'medley' | 'choice';

export interface StepTarget {
  effort: Effort;
  /** segundos por km (opcional; só aparece se o profissional definir). */
  paceSecPerKm?: number;
  hrZone?: 1 | 2 | 3 | 4 | 5;
  power?: number;
  cadence?: number;
}

export interface SportMeta {
  stroke?: SwimStroke;
  equipment?: string;
  movement?: string;
}

export interface GuidedSingleStep {
  kind: 'single';
  id: string;
  role: StepRole;
  label?: string;
  bound: StepBound;
  target?: StepTarget;
  rest?: StepBound;
  sport?: SportMeta;
  note?: string;
}

export interface GuidedRepeatStep {
  kind: 'repeat';
  id: string;
  times: number;
  steps: GuidedSingleStep[];
}

export type GuidedStep = GuidedSingleStep | GuidedRepeatStep;

export type GuidedFormat = 'intervals' | 'amrap' | 'emom' | 'tabata' | 'forTime' | 'flow' | 'sets';

export interface GuidedWorkout {
  schemaVersion: 1;
  sport: WorkoutTrainingType;
  format?: GuidedFormat;
  steps: GuidedStep[];
}

// ---------------------------------------------------------------------------
// Parsers de texto livre (a prescrição do profissional é string). Toleram vazio.
// ---------------------------------------------------------------------------

function deaccent(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** "30 min" / "30min" / "1:30" (mm:ss) / "90 s" / "45seg" → segundos. */
export function parseDurationToSeconds(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  const clock = value.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const hours = value.match(/(\d+(?:[.,]\d+)?)\s*h(?:oras?)?\b/);
  const mins = value.match(/(\d+(?:[.,]\d+)?)\s*(?:min|minutos?|m)\b/);
  const secs = value.match(/(\d+)\s*(?:s|seg|segundos?)\b/);
  let total = 0;
  let matched = false;
  if (hours) { total += Number(hours[1].replace(',', '.')) * 3600; matched = true; }
  if (mins) { total += Number(mins[1].replace(',', '.')) * 60; matched = true; }
  if (secs) { total += Number(secs[1]); matched = true; }
  return matched ? Math.round(total) : null;
}

/** "5 km" / "5km" / "400 m" / "400m" / "1,5 km" → metros. */
export function parseDistanceToMeters(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  const km = value.match(/(\d+(?:[.,]\d+)?)\s*km\b/);
  if (km) return Math.round(Number(km[1].replace(',', '.')) * 1000);
  const m = value.match(/(\d+(?:[.,]\d+)?)\s*m(?:etros?)?\b/);
  if (m) return Math.round(Number(m[1].replace(',', '.')));
  return null;
}

/** "5:30/km" / "5:30 min/km" / "5:30" → segundos por km. */
export function parsePaceToSecPerKm(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const clock = raw.trim().match(/(\d{1,2}):(\d{2})/);
  if (!clock) return null;
  return Number(clock[1]) * 60 + Number(clock[2]);
}

/** "6x" / "6 x" / "6" → número de repetições (>=1). */
export function parseRepeatTimes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/(\d+)\s*x?/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function inferEffort(...texts: (string | null | undefined)[]): Effort {
  const value = deaccent(texts.filter(Boolean).join(' '));
  if (/\b(recupera|recovery|descanso|solto|regenerativ)\b/.test(value)) return 'recover';
  if (/\b(max|maxim|all ?out|tiro|sprint)\b/.test(value)) return 'max';
  if (/\b(forte|intens|hard|limiar|threshold|z4|z5|ritmo de prova)\b/.test(value)) return 'hard';
  if (/\b(leve|facil|easy|trote|z1|z2|aquec|conversa)\b/.test(value)) return 'easy';
  return 'moderate';
}

function inferRole(...texts: (string | null | undefined)[]): StepRole {
  const value = deaccent(texts.filter(Boolean).join(' '));
  if (/\b(aquec|warm|mobilidade|ativa)\b/.test(value)) return 'warmup';
  if (/\b(desaquec|cool|volta a calma|solto|alonga)\b/.test(value)) return 'cooldown';
  if (/\b(recupera|recovery|descanso)\b/.test(value)) return 'recovery';
  return 'main';
}

function boundFromText(distance?: string | null, duration?: string | null, reps?: string | null): StepBound {
  const meters = parseDistanceToMeters(distance) ?? parseDistanceToMeters(reps);
  if (meters) return { by: 'distance', meters };
  const seconds = parseDurationToSeconds(duration) ?? parseDurationToSeconds(reps);
  if (seconds) return { by: 'time', seconds };
  const repCount = parseRepeatTimes(reps);
  if (repCount && !/[a-z]/i.test((reps ?? '').replace(/x/i, ''))) return { by: 'reps', reps: repCount };
  return { by: 'open' };
}

let derivedCounter = 0;
function stepId(prefix: string): string {
  derivedCounter += 1;
  return `${prefix}-${derivedCounter}`;
}

// ---------------------------------------------------------------------------
// Derivações → GuidedWorkout
// ---------------------------------------------------------------------------

function stepFromBlock(block: PrescriptionBlock): GuidedSingleStep {
  const target: StepTarget = { effort: inferEffort(block.intensityTarget, block.intensityRange, block.name, block.task) };
  const pace = parsePaceToSecPerKm(block.intensityTarget) ?? parsePaceToSecPerKm(block.intensityRange);
  if (pace) target.paceSecPerKm = pace;
  const rest = boundFromText(null, block.recoveryDuration, block.recoveryDuration);
  const roles: StepRole[] = ['warmup', 'activation', 'main', 'cooldown', 'recovery'];
  return {
    kind: 'single',
    id: block.id || stepId('block'),
    role: roles.includes(block.role as StepRole) ? (block.role as StepRole) : inferRole(block.name, block.task),
    label: block.name || block.task || undefined,
    bound: boundFromText(block.distance, block.duration, block.repetitions),
    target,
    rest: rest.by === 'open' ? undefined : rest,
    note: block.technique || undefined,
  };
}

function fromBlocks(prescription: WorkoutPrescription): GuidedStep[] {
  return prescription.blocks
    .filter((block) => block.task?.trim() || block.name?.trim() || block.distance?.trim() || block.duration?.trim() || block.repetitions?.trim())
    .map((block): GuidedStep => {
      const times = parseRepeatTimes(block.series);
      const single = stepFromBlock(block);
      if (times && times > 1) {
        return { kind: 'repeat', id: stepId('rep'), times, steps: [single] };
      }
      return single;
    });
}

function fromExercises(exercises: StudentWorkoutExercise[]): GuidedStep[] {
  return exercises.map((exercise): GuidedStep => {
    const label = exercise.studentDisplayName || exercise.exerciseName || 'Exercício';
    const bound = boundFromText(null, exercise.reps, exercise.reps);
    return {
      kind: 'single',
      id: exercise.id || stepId('ex'),
      role: inferRole(label, exercise.notes),
      label,
      bound: bound.by === 'open' ? { by: 'reps', reps: Math.max(1, exercise.sets) } : bound,
      target: { effort: inferEffort(label, exercise.notes, exercise.tempoNotes) },
      note: exercise.notes || exercise.tempoNotes || undefined,
    };
  });
}

/** Lê passos estruturados já gravados na prescrição (fonte preferida). */
function readStructuredSteps(prescription: WorkoutPrescription | null): GuidedStep[] | null {
  const steps = (prescription as (WorkoutPrescription & { steps?: unknown }) | null)?.steps;
  if (!Array.isArray(steps) || steps.length === 0) return null;
  return steps as GuidedStep[];
}

/**
 * Constrói o treino executável de um StudentWorkout.
 * `null` = é musculação (segue no Player de força atual, intacto).
 * Precedência: passos estruturados → blocos da prescrição → exercícios → fallback.
 */
export function toGuidedWorkout(workout: StudentWorkout): GuidedWorkout | null {
  if (workout.trainingType === 'strength') return null;

  const structured = readStructuredSteps(workout.prescription);
  if (structured) {
    return { schemaVersion: 1, sport: workout.trainingType, steps: structured };
  }

  if (workout.prescription && workout.prescription.blocks.length > 0) {
    const steps = fromBlocks(workout.prescription);
    if (steps.length > 0) return { schemaVersion: 1, sport: workout.trainingType, steps };
  }

  if (workout.exercises.length > 0) {
    return { schemaVersion: 1, sport: workout.trainingType, steps: fromExercises(workout.exercises) };
  }

  return {
    schemaVersion: 1,
    sport: workout.trainingType,
    steps: [{ kind: 'single', id: stepId('fallback'), role: 'main', label: workout.title, bound: { by: 'open' }, target: { effort: 'moderate' } }],
  };
}

// ---------------------------------------------------------------------------
// Helpers de execução (usados pelo player)
// ---------------------------------------------------------------------------

export interface FlatStep {
  step: GuidedSingleStep;
  /** ex.: "2/6" quando dentro de um repeat; undefined fora. */
  repeatLabel?: string;
}

/** Expande blocos `repeat` numa lista linear de passos. */
export function flattenSteps(steps: GuidedStep[]): FlatStep[] {
  const flat: FlatStep[] = [];
  for (const step of steps) {
    if (step.kind === 'repeat') {
      for (let round = 1; round <= step.times; round += 1) {
        for (const inner of step.steps) {
          flat.push({ step: inner, repeatLabel: `${round}/${step.times}` });
        }
      }
    } else {
      flat.push({ step });
    }
  }
  return flat;
}

/** Estimativa de duração total (segundos) para exibir no card/resumo. */
export function estimateDurationSeconds(steps: GuidedStep[]): number {
  const OPEN_FALLBACK = 60;
  const REP_SECONDS = 4;
  return flattenSteps(steps).reduce((total, { step }) => {
    const bound = step.bound;
    const base = bound.by === 'time' ? bound.seconds
      : bound.by === 'reps' ? bound.reps * REP_SECONDS
      : bound.by === 'distance' ? Math.round((bound.meters / 1000) * (step.target?.paceSecPerKm ?? 360))
      : OPEN_FALLBACK;
    const rest = step.rest?.by === 'time' ? step.rest.seconds : 0;
    return total + base + rest;
  }, 0);
}
