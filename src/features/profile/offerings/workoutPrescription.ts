import type { TranslationKey } from '@/i18n/translations';
import type { WorkoutTrainingType } from '@/features/training/useStudentWorkouts';
import type { GuidedStep } from '@/features/training/guidedSession';

export type PrescriptionField = {
  key: string;
  label: TranslationKey;
  placeholder: TranslationKey;
};

export type PrescriptionBlock = {
  id: string;
  role: 'warmup' | 'activation' | 'main' | 'complementary' | 'cooldown' | 'recovery';
  name: string;
  task: string;
  series: string;
  repetitions: string;
  distance: string;
  duration: string;
  intensityType: string;
  intensityTarget: string;
  intensityRange: string;
  recoveryDuration: string;
  recoveryType: string;
  recoveryIntensity: string;
  technique: string;
  equipment: string;
  progressionCriteria: string;
  interruptionCriteria: string;
};

export type WorkoutPrescription = {
  schemaVersion: 1;
  modality: WorkoutTrainingType;
  session: {
    sessionType: string;
    objective: string;
    periodizationPhase: string;
    estimatedDuration: string;
    totalVolume: string;
    intensityModel: string;
    environment: string;
    equipment: string;
    monitoring: string;
    postWorkoutRecovery: string;
    interruptionCriteria: string;
  };
  specifics: Record<string, string>;
  blocks: PrescriptionBlock[];
  strengthExercises?: StrengthExercisePrescription[];
  /** Passos legados; blocos são a fonte canônica da prescrição. */
  steps?: GuidedStep[];
};

export type StrengthExercisePrescription = {
  exerciseId: string;
  load: string;
  loadType: string;
  relativeLoad: string;
  rpe: string;
  rir: string;
  tempo: string;
  rangeOfMotion: string;
  contraction: string;
  laterality: string;
  velocityLoss: string;
};

export const WORKOUT_TYPES: WorkoutTrainingType[] = [
  'strength',
  'running',
  'walking',
  'cycling',
  'swimming',
  'functional',
  'hiit',
  'yoga',
  'pilates',
  'other',
];

export const WORKOUT_TYPE_KEYS: Record<WorkoutTrainingType, TranslationKey> = {
  strength: 'meufit.training.surface.strength',
  running: 'meufit.training.surface.running',
  cycling: 'meufit.training.surface.cycling',
  walking: 'meufit.training.surface.walking',
  swimming: 'meufit.training.surface.swimming',
  functional: 'meufit.training.surface.functional',
  hiit: 'meufit.training.surface.hiit',
  yoga: 'meufit.training.surface.yoga',
  pilates: 'meufit.training.surface.pilates',
  other: 'meufit.training.surface.other',
};

const field = (key: string, label: TranslationKey, placeholder: TranslationKey): PrescriptionField => ({
  key,
  label,
  placeholder,
});

export const SPECIFIC_FIELDS: Record<WorkoutTrainingType, PrescriptionField[]> = {
  running: [
    field('distance', 'offer.workout.specific.distance', 'offer.workout.placeholder.distanceRun'),
    field('pace', 'offer.workout.specific.pace', 'offer.workout.placeholder.pace'),
    field('heartRate', 'offer.workout.specific.heartRate', 'offer.workout.placeholder.heartRate'),
    field('power', 'offer.workout.specific.runningPower', 'offer.workout.placeholder.power'),
    field('rpe', 'offer.workout.specific.rpe', 'offer.workout.placeholder.rpe'),
    field('cadenceSpm', 'offer.workout.specific.cadenceSpm', 'offer.workout.placeholder.cadenceSpm'),
    field('elevation', 'offer.workout.specific.elevation', 'offer.workout.placeholder.elevation'),
    field('surface', 'offer.workout.specific.surface', 'offer.workout.placeholder.runningSurface'),
    field('effortDistribution', 'offer.workout.specific.effortDistribution', 'offer.workout.placeholder.effortDistribution'),
  ],
  walking: [
    field('discipline', 'offer.workout.specific.walkingDiscipline', 'offer.workout.placeholder.walkingDiscipline'),
    field('distance', 'offer.workout.specific.distance', 'offer.workout.placeholder.distanceWalk'),
    field('pace', 'offer.workout.specific.pace', 'offer.workout.placeholder.walkingPace'),
    field('heartRate', 'offer.workout.specific.heartRate', 'offer.workout.placeholder.heartRate'),
    field('rpe', 'offer.workout.specific.rpe', 'offer.workout.placeholder.rpe'),
    field('cadenceSpm', 'offer.workout.specific.cadenceSpm', 'offer.workout.placeholder.walkingCadence'),
    field('incline', 'offer.workout.specific.incline', 'offer.workout.placeholder.incline'),
    field('terrain', 'offer.workout.specific.terrain', 'offer.workout.placeholder.walkingTerrain'),
    field('technique', 'offer.workout.specific.walkingTechnique', 'offer.workout.placeholder.walkingTechnique'),
  ],
  strength: [
    field('strengthGoal', 'offer.workout.specific.strengthGoal', 'offer.workout.placeholder.strengthGoal'),
    field('loadReference', 'offer.workout.specific.loadReference', 'offer.workout.placeholder.loadReference'),
    field('tempoConvention', 'offer.workout.specific.tempoConvention', 'offer.workout.placeholder.tempoConvention'),
    field('method', 'offer.workout.specific.strengthMethod', 'offer.workout.placeholder.strengthMethod'),
    field('velocityLoss', 'offer.workout.specific.velocityLoss', 'offer.workout.placeholder.velocityLoss'),
  ],
  cycling: [
    field('discipline', 'offer.workout.specific.cyclingDiscipline', 'offer.workout.placeholder.cyclingDiscipline'),
    field('environment', 'offer.workout.specific.cyclingEnvironment', 'offer.workout.placeholder.cyclingEnvironment'),
    field('distance', 'offer.workout.specific.distance', 'offer.workout.placeholder.distanceBike'),
    field('power', 'offer.workout.specific.power', 'offer.workout.placeholder.cyclingPower'),
    field('relativePower', 'offer.workout.specific.relativePower', 'offer.workout.placeholder.relativePower'),
    field('heartRate', 'offer.workout.specific.heartRate', 'offer.workout.placeholder.heartRate'),
    field('rpe', 'offer.workout.specific.rpe', 'offer.workout.placeholder.rpe'),
    field('cadenceRpm', 'offer.workout.specific.cadenceRpm', 'offer.workout.placeholder.cadenceRpm'),
    field('elevation', 'offer.workout.specific.elevation', 'offer.workout.placeholder.elevation'),
    field('position', 'offer.workout.specific.cyclingPosition', 'offer.workout.placeholder.cyclingPosition'),
    field('trainerMode', 'offer.workout.specific.trainerMode', 'offer.workout.placeholder.trainerMode'),
    field('nutrition', 'offer.workout.specific.nutrition', 'offer.workout.placeholder.cyclingNutrition'),
  ],
  swimming: [
    field('poolLength', 'offer.workout.specific.poolLength', 'offer.workout.placeholder.poolLength'),
    field('course', 'offer.workout.specific.course', 'offer.workout.placeholder.course'),
    field('totalDistance', 'offer.workout.specific.totalDistance', 'offer.workout.placeholder.swimDistance'),
    field('stroke', 'offer.workout.specific.stroke', 'offer.workout.placeholder.stroke'),
    field('pace', 'offer.workout.specific.swimPace', 'offer.workout.placeholder.swimPace'),
    field('css', 'offer.workout.specific.css', 'offer.workout.placeholder.css'),
    field('rpe', 'offer.workout.specific.rpe', 'offer.workout.placeholder.rpe'),
    field('sendOff', 'offer.workout.specific.sendOff', 'offer.workout.placeholder.sendOff'),
    field('restInterval', 'offer.workout.specific.restInterval', 'offer.workout.placeholder.restInterval'),
    field('strokeRate', 'offer.workout.specific.strokeRate', 'offer.workout.placeholder.strokeRate'),
    field('strokeCount', 'offer.workout.specific.strokeCount', 'offer.workout.placeholder.strokeCount'),
    field('breathing', 'offer.workout.specific.breathing', 'offer.workout.placeholder.breathing'),
    field('swimEquipment', 'offer.workout.specific.swimEquipment', 'offer.workout.placeholder.swimEquipment'),
  ],
  functional: [
    field('format', 'offer.workout.specific.format', 'offer.workout.placeholder.functionalFormat'),
    field('rounds', 'offer.workout.specific.rounds', 'offer.workout.placeholder.rounds'),
    field('workRest', 'offer.workout.specific.workRest', 'offer.workout.placeholder.workRest'),
    field('rpe', 'offer.workout.specific.rpe', 'offer.workout.placeholder.rpe'),
  ],
  hiit: [
    field('format', 'offer.workout.specific.format', 'offer.workout.placeholder.hiitFormat'),
    field('rounds', 'offer.workout.specific.rounds', 'offer.workout.placeholder.rounds'),
    field('workRest', 'offer.workout.specific.workRest', 'offer.workout.placeholder.workRest'),
    field('intensity', 'offer.workout.specific.intensity', 'offer.workout.placeholder.hiitIntensity'),
  ],
  yoga: [
    field('style', 'offer.workout.specific.style', 'offer.workout.placeholder.yogaStyle'),
    field('breathing', 'offer.workout.specific.breathing', 'offer.workout.placeholder.yogaBreathing'),
    field('laterality', 'offer.workout.specific.laterality', 'offer.workout.placeholder.laterality'),
    field('props', 'offer.workout.specific.props', 'offer.workout.placeholder.yogaProps'),
  ],
  pilates: [
    field('apparatus', 'offer.workout.specific.apparatus', 'offer.workout.placeholder.pilatesApparatus'),
    field('resistance', 'offer.workout.specific.resistance', 'offer.workout.placeholder.pilatesResistance'),
    field('breathing', 'offer.workout.specific.breathing', 'offer.workout.placeholder.pilatesBreathing'),
    field('tempo', 'offer.workout.specific.tempo', 'offer.workout.placeholder.pilatesTempo'),
  ],
  other: [
    field('discipline', 'offer.workout.specific.discipline', 'offer.workout.placeholder.discipline'),
    field('volumeReference', 'offer.workout.specific.volumeReference', 'offer.workout.placeholder.volumeReference'),
    field('intensityReference', 'offer.workout.specific.intensityReference', 'offer.workout.placeholder.intensityReference'),
  ],
};

export const BLOCK_ROLE_KEYS: Record<PrescriptionBlock['role'], TranslationKey> = {
  warmup: 'offer.workout.block.role.warmup',
  activation: 'offer.workout.block.role.activation',
  main: 'offer.workout.block.role.main',
  complementary: 'offer.workout.block.role.complementary',
  cooldown: 'offer.workout.block.role.cooldown',
  recovery: 'offer.workout.block.role.recovery',
};

export function createPrescriptionBlock(role: PrescriptionBlock['role'] = 'main'): PrescriptionBlock {
  return {
    id: crypto.randomUUID(),
    role,
    name: '',
    task: '',
    series: '',
    repetitions: '',
    distance: '',
    duration: '',
    intensityType: '',
    intensityTarget: '',
    intensityRange: '',
    recoveryDuration: '',
    recoveryType: '',
    recoveryIntensity: '',
    technique: '',
    equipment: '',
    progressionCriteria: '',
    interruptionCriteria: '',
  };
}

export function createWorkoutPrescription(modality: WorkoutTrainingType): WorkoutPrescription {
  return {
    schemaVersion: 1,
    modality,
    session: {
      sessionType: '',
      objective: '',
      periodizationPhase: '',
      estimatedDuration: '',
      totalVolume: '',
      intensityModel: '',
      environment: '',
      equipment: '',
      monitoring: '',
      postWorkoutRecovery: '',
      interruptionCriteria: '',
    },
    specifics: Object.fromEntries(SPECIFIC_FIELDS[modality].map(({ key }) => [key, ''])),
    blocks: [
      createPrescriptionBlock('warmup'),
      createPrescriptionBlock('main'),
      createPrescriptionBlock('cooldown'),
    ],
    steps: undefined,
  };
}

export function normalizeWorkoutPrescription(
  value: unknown,
  modality: WorkoutTrainingType,
): WorkoutPrescription {
  const fallback = createWorkoutPrescription(modality);
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Partial<WorkoutPrescription>;
  const blocks = Array.isArray(candidate.blocks) && candidate.blocks.length > 0 ? candidate.blocks : fallback.blocks;
  return {
    ...fallback,
    ...candidate,
    schemaVersion: 1,
    modality,
    session: { ...fallback.session, ...(candidate.session ?? {}) },
    specifics: { ...fallback.specifics, ...(candidate.specifics ?? {}) },
    blocks: blocks.map((block) => ({
      ...createPrescriptionBlock(block.role ?? 'main'),
      ...block,
      id: block.id || crypto.randomUUID(),
    })),
    steps: Array.isArray(candidate.steps) ? (candidate.steps as GuidedStep[]) : fallback.steps,
  };
}
