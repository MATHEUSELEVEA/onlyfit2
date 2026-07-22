import { describe, it, expect } from 'vitest';
import {
  toGuidedWorkout,
  flattenSteps,
  estimateDurationSeconds,
  parseDurationToSeconds,
  parseDistanceToMeters,
  parsePaceToSecPerKm,
  parseRepeatTimes,
  inferEffort,
  parseSwimStroke,
  parseGuidedFormat,
  type GuidedSingleStep,
} from './guidedSession';
import type { StudentWorkout } from './useStudentWorkouts';

const exercise = (over: Partial<StudentWorkout['exercises'][number]>) => ({
  id: 'e', exerciseName: null, studentDisplayName: null, muscleGroup: null, sets: 1, reps: '', notes: null, tempoNotes: null, videoUrl: null, position: 0, ...over,
});
const workout = (over: Partial<StudentWorkout>): StudentWorkout => ({
  assignmentId: 'a', workoutId: 'w', title: 'T', daysOfWeek: [], weeks: [], startsAt: null, endsAt: null,
  exerciseCount: 0, exercises: [], trainingType: 'running', prescription: null, cycleId: null, sourceType: 'coach', assignedBy: 'c', ...over,
});

describe('parsers', () => {
  it('duração', () => {
    expect(parseDurationToSeconds('1:30')).toBe(90);
    expect(parseDurationToSeconds('30 min')).toBe(1800);
    expect(parseDurationToSeconds('90s')).toBe(90);
    expect(parseDurationToSeconds('')).toBeNull();
  });
  it('distância', () => {
    expect(parseDistanceToMeters('5 km')).toBe(5000);
    expect(parseDistanceToMeters('400m')).toBe(400);
    expect(parseDistanceToMeters('1,5 km')).toBe(1500);
  });
  it('pace e repeat', () => {
    expect(parsePaceToSecPerKm('5:30/km')).toBe(330);
    expect(parseRepeatTimes('6x')).toBe(6);
  });
  it('esforço inferido', () => {
    expect(inferEffort('Tiro forte')).toBe('hard');
    expect(inferEffort('trote leve')).toBe('easy');
    expect(inferEffort('Bloco principal')).toBe('moderate');
  });
});

describe('toGuidedWorkout — caminho estruturado (seed Corrida de Rua 5K)', () => {
  const w = workout({
    trainingType: 'running',
    prescription: {
      schemaVersion: 1, modality: 'running',
      session: { sessionType: '', objective: 'Base + tiros', periodizationPhase: '', estimatedDuration: '', totalVolume: '', intensityModel: '', environment: '', equipment: '', monitoring: '', postWorkoutRecovery: '', interruptionCriteria: '' },
      specifics: {}, blocks: [],
      steps: [
        { kind: 'single', id: 's1', role: 'warmup', bound: { by: 'time', seconds: 600 }, target: { effort: 'easy' } },
        { kind: 'repeat', id: 'r1', times: 6, steps: [{ kind: 'single', id: 's2', role: 'main', bound: { by: 'time', seconds: 60 }, target: { effort: 'hard', paceSecPerKm: 300 }, rest: { by: 'time', seconds: 120 } }] },
        { kind: 'single', id: 's3', role: 'cooldown', bound: { by: 'time', seconds: 300 }, target: { effort: 'easy' } },
      ],
    } as unknown as StudentWorkout['prescription'],
  });

  it('usa os passos estruturados e expande o repeat em 8 passos de trabalho', () => {
    const g = toGuidedWorkout(w);
    expect(g).not.toBeNull();
    expect(g!.steps).toHaveLength(3);
    const flat = flattenSteps(g!.steps);
    expect(flat).toHaveLength(8); // aquecimento + 6 tiros + desaquecimento
    expect(flat[1].repeatLabel).toBe('1/6');
    expect(flat[6].repeatLabel).toBe('6/6');
    const tiro = flat[1].step;
    expect(tiro.target?.effort).toBe('hard');
    expect(tiro.target?.paceSecPerKm).toBe(300);
    expect(tiro.rest).toEqual({ by: 'time', seconds: 120 });
  });
});

describe('toGuidedWorkout — caminho derivado (seed sem prescrição)', () => {
  const w = workout({
    trainingType: 'running', prescription: null,
    exercises: [
      exercise({ id: 'e1', studentDisplayName: 'Aquecimento', reps: '10 min' }),
      exercise({ id: 'e2', studentDisplayName: 'Bloco principal', reps: '30 min' }),
      exercise({ id: 'e3', studentDisplayName: 'Desaquecimento', reps: '5 min' }),
    ],
  });

  it('deriva passos por tempo com papel/esforço inferidos', () => {
    const g = toGuidedWorkout(w);
    expect(g).not.toBeNull();
    expect(g!.steps).toHaveLength(3);
    const [s0, s1, s2] = g!.steps as GuidedSingleStep[];
    expect(s0.role).toBe('warmup');
    expect(s0.bound).toEqual({ by: 'time', seconds: 600 });
    expect(s1.role).toBe('main');
    expect(s1.bound).toEqual({ by: 'time', seconds: 1800 });
    expect(s2.role).toBe('cooldown');
    expect(estimateDurationSeconds(g!.steps)).toBe(600 + 1800 + 300);
  });
});

describe('toGuidedWorkout — musculação', () => {
  it('retorna null (segue no player de força)', () => {
    expect(toGuidedWorkout(workout({ trainingType: 'strength' }))).toBeNull();
  });
  it('fallback: sem prescrição nem exercícios → 1 passo aberto', () => {
    const g = toGuidedWorkout(workout({ trainingType: 'yoga', prescription: null, exercises: [] }));
    expect(g!.steps).toHaveLength(1);
    expect((g!.steps[0] as GuidedSingleStep).bound).toEqual({ by: 'open' });
  });
});

describe('parseSwimStroke / parseGuidedFormat', () => {
  it('estilos com acento, inglês e dentro de frase', () => {
    expect(parseSwimStroke('Borboleta')).toBe('fly');
    expect(parseSwimStroke('4x50 costas')).toBe('back');
    expect(parseSwimStroke('crawl solto')).toBe('free');
    expect(parseSwimStroke('nado peito')).toBe('breast');
    expect(parseSwimStroke('Bloco principal')).toBeNull();
  });
  it('formatos HIIT', () => {
    expect(parseGuidedFormat('AMRAP 12 min')).toBe('amrap');
    expect(parseGuidedFormat('emom')).toBe('emom');
    expect(parseGuidedFormat('For Time')).toBe('forTime');
    expect(parseGuidedFormat('circuito')).toBeNull();
  });
});

describe('toGuidedWorkout — específicos por esporte', () => {
  const swimPrescription = (steps: unknown, stroke: string) => ({
    schemaVersion: 1, modality: 'swimming',
    session: { sessionType: '', objective: '', periodizationPhase: '', estimatedDuration: '', totalVolume: '', intensityModel: '', environment: '', equipment: '', monitoring: '', postWorkoutRecovery: '', interruptionCriteria: '' },
    specifics: { stroke }, blocks: [], steps,
  }) as unknown as StudentWorkout['prescription'];

  it('natação: specifics.stroke vira default dos passos sem estilo, sem sobrescrever', () => {
    const g = toGuidedWorkout(workout({
      trainingType: 'swimming',
      prescription: swimPrescription([
        { kind: 'single', id: 's1', role: 'warmup', bound: { by: 'distance', meters: 200 }, target: { effort: 'easy' } },
        { kind: 'single', id: 's2', role: 'main', bound: { by: 'distance', meters: 100 }, target: { effort: 'hard' }, sport: { stroke: 'fly' } },
        { kind: 'repeat', id: 'r1', times: 4, steps: [{ kind: 'single', id: 's3', role: 'main', bound: { by: 'distance', meters: 50 }, target: { effort: 'hard' } }] },
      ], 'Costas'),
    }));
    const flat = flattenSteps(g!.steps);
    expect(flat[0].step.sport?.stroke).toBe('back');
    expect(flat[1].step.sport?.stroke).toBe('fly');
    expect(flat[2].step.sport?.stroke).toBe('back');
  });

  it('natação: bloco textual "4x50 costas" ganha o estilo do texto', () => {
    const g = toGuidedWorkout(workout({
      trainingType: 'swimming',
      prescription: {
        schemaVersion: 1, modality: 'swimming',
        session: { sessionType: '', objective: '', periodizationPhase: '', estimatedDuration: '', totalVolume: '', intensityModel: '', environment: '', equipment: '', monitoring: '', postWorkoutRecovery: '', interruptionCriteria: '' },
        specifics: {},
        blocks: [{ id: 'b1', role: 'main', name: '4x50 costas', task: '', series: '', repetitions: '', distance: '50 m', duration: '', intensityType: '', intensityTarget: 'forte', intensityRange: '', recoveryDuration: '', recoveryType: '', recoveryIntensity: '', technique: '', equipment: '', progressionCriteria: '', interruptionCriteria: '' }],
      } as unknown as StudentWorkout['prescription'],
    }));
    const flat = flattenSteps(g!.steps);
    expect(flat[0].step.sport?.stroke).toBe('back');
  });

  it('hiit: specifics.format preenche GuidedWorkout.format', () => {
    const g = toGuidedWorkout(workout({
      trainingType: 'hiit',
      prescription: {
        schemaVersion: 1, modality: 'hiit',
        session: { sessionType: '', objective: '', periodizationPhase: '', estimatedDuration: '', totalVolume: '', intensityModel: '', environment: '', equipment: '', monitoring: '', postWorkoutRecovery: '', interruptionCriteria: '' },
        specifics: { format: 'AMRAP 12 min' }, blocks: [],
        steps: [{ kind: 'single', id: 's1', role: 'main', bound: { by: 'reps', reps: 10 }, target: { effort: 'hard' } }],
      } as unknown as StudentWorkout['prescription'],
    }));
    expect(g!.format).toBe('amrap');
  });
});

describe('defaults por esporte no editor', () => {
  it('natação começa por distância; hiit por rodadas de reps', async () => {
    const { createWorkoutPrescription } = await import('@/features/profile/offerings/workoutPrescription');
    const swim = createWorkoutPrescription('swimming');
    expect(swim.steps![0].kind === 'single' && swim.steps![0].bound.by).toBe('distance');
    const hiit = createWorkoutPrescription('hiit');
    expect(hiit.steps![1].kind).toBe('repeat');
  });
});
