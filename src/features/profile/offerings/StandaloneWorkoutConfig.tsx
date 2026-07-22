import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bike,
  ChevronDown,
  ChevronUp,
  CircleEllipsis,
  Dumbbell,
  Flower2,
  Footprints,
  Loader2,
  Plus,
  Search,
  Trash2,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { useTranslation } from '@/i18n/I18nProvider';
import type { WorkoutTrainingType } from '@/features/training/useStudentWorkouts';
import type { OfferingConfigProps } from './OfferingConfigProps';
import {
  BLOCK_ROLE_KEYS,
  SPECIFIC_FIELDS,
  WORKOUT_TYPE_KEYS,
  WORKOUT_TYPES,
  createPrescriptionBlock,
  createWorkoutPrescription,
  normalizeWorkoutPrescription,
  type PrescriptionBlock,
  type StrengthExercisePrescription,
  type WorkoutPrescription,
} from './workoutPrescription';
import {
  useExerciseLibrarySearch,
  useSaveWorkoutOfferingContent,
  useWorkoutOfferingTemplate,
  type ExerciseLibraryItem,
} from './useOfferingContent';
import { GuidedStepsEditor } from './GuidedStepsEditor';
import type { GuidedStep } from '@/features/training/guidedSession';

type StrengthExerciseDraft = StrengthExercisePrescription & {
  localId: string;
  exerciseId: string;
  name: string;
  muscle: string;
  videoUrl: string | null;
  sets: string;
  reps: string;
  restSeconds: string;
  notes: string;
};

const TYPE_ICONS: Record<WorkoutTrainingType, LucideIcon> = {
  strength: Dumbbell,
  running: Activity,
  cycling: Bike,
  walking: Footprints,
  swimming: Waves,
  functional: Activity,
  hiit: Zap,
  yoga: Flower2,
  pilates: Activity,
  other: CircleEllipsis,
};

const storedUuid = (settings: Record<string, unknown>, key: string): string | null => {
  const value = settings[key];
  return typeof value === 'string' && value ? value : null;
};

const numberOr = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function newStrengthExercise(item: ExerciseLibraryItem): StrengthExerciseDraft {
  return {
    localId: crypto.randomUUID(),
    exerciseId: item.id,
    name: item.name,
    muscle: item.muscles[0] ?? item.category ?? '',
    videoUrl: item.videoUrl,
    sets: '3',
    reps: '10',
    restSeconds: '60',
    notes: '',
    load: '',
    loadType: 'kg',
    relativeLoad: '',
    rpe: '',
    rir: '',
    tempo: '',
    rangeOfMotion: '',
    contraction: '',
    laterality: '',
    velocityLoss: '',
  };
}

export function StandaloneWorkoutConfig({ offering }: OfferingConfigProps) {
  const { t } = useTranslation();
  const initialWorkoutId = storedUuid(offering.settings, 'workout_template_id');
  const initialType = storedUuid(offering.settings, 'training_type') as WorkoutTrainingType | null;
  const templateQuery = useWorkoutOfferingTemplate(initialWorkoutId);
  const saveMutation = useSaveWorkoutOfferingContent(offering.id);

  const [step, setStep] = useState<1 | 2>(initialWorkoutId ? 2 : 1);
  const [trainingType, setTrainingType] = useState<WorkoutTrainingType | null>(initialType);
  const [workoutId, setWorkoutId] = useState<string | null>(initialWorkoutId);
  const [title, setTitle] = useState(offering.name);
  const [description, setDescription] = useState('');
  const [prescription, setPrescription] = useState<WorkoutPrescription | null>(initialType ? createWorkoutPrescription(initialType) : null);
  const [exercises, setExercises] = useState<StrengthExerciseDraft[]>([]);
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedTemplateId, setLoadedTemplateId] = useState<string | null>(null);
  const exerciseSearch = useExerciseLibrarySearch(search, trainingType === 'strength');

  useEffect(() => {
    const template = templateQuery.data;
    if (!template || loadedTemplateId === template.id) return;
    const normalized = normalizeWorkoutPrescription(template.prescription, template.trainingType);
    const detailById = new Map((normalized.strengthExercises ?? []).map((exercise) => [exercise.exerciseId, exercise]));
    // The query result is the external source used to hydrate this editable draft once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadedTemplateId(template.id);
    setWorkoutId(template.id);
    setTrainingType(template.trainingType);
    setTitle(template.title);
    setDescription(template.description);
    setPrescription(normalized);
    setExercises(template.exercises.map((exercise) => ({
      localId: crypto.randomUUID(),
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      muscle: exercise.muscle,
      videoUrl: exercise.videoUrl,
      sets: String(exercise.sets),
      reps: exercise.reps,
      restSeconds: String(exercise.restSeconds),
      notes: exercise.notes,
      load: detailById.get(exercise.exerciseId)?.load ?? '',
      loadType: detailById.get(exercise.exerciseId)?.loadType ?? 'kg',
      relativeLoad: detailById.get(exercise.exerciseId)?.relativeLoad ?? '',
      rpe: detailById.get(exercise.exerciseId)?.rpe ?? '',
      rir: detailById.get(exercise.exerciseId)?.rir ?? '',
      tempo: detailById.get(exercise.exerciseId)?.tempo ?? '',
      rangeOfMotion: detailById.get(exercise.exerciseId)?.rangeOfMotion ?? '',
      contraction: detailById.get(exercise.exerciseId)?.contraction ?? '',
      laterality: detailById.get(exercise.exerciseId)?.laterality ?? '',
      velocityLoss: detailById.get(exercise.exerciseId)?.velocityLoss ?? '',
    })));
  }, [loadedTemplateId, templateQuery.data]);

  const isReady = useMemo(() => {
    if (!trainingType || !prescription || title.trim().length < 3 || !prescription.session.objective.trim()) return false;
    // Musculação: exige exercícios + tarefas dos blocos. Demais: exige ao menos 1 passo guiado.
    if (trainingType === 'strength') {
      if (prescription.blocks.some((block) => !block.task.trim())) return false;
      return exercises.length > 0;
    }
    return (prescription.steps?.length ?? 0) > 0;
  }, [exercises.length, prescription, title, trainingType]);

  function chooseType(type: WorkoutTrainingType) {
    setTrainingType(type);
    setPrescription(createWorkoutPrescription(type));
    setExercises(type === 'strength' ? exercises : []);
    setStep(2);
    setFeedback(null);
    setError(null);
  }

  function updateSession(key: keyof WorkoutPrescription['session'], value: string) {
    setPrescription((current) => current ? { ...current, session: { ...current.session, [key]: value } } : current);
  }

  function updateSpecific(key: string, value: string) {
    setPrescription((current) => current ? { ...current, specifics: { ...current.specifics, [key]: value } } : current);
  }

  function updateSteps(steps: GuidedStep[]) {
    setPrescription((current) => current ? { ...current, steps } : current);
  }

  function updateBlock(id: string, patch: Partial<PrescriptionBlock>) {
    setPrescription((current) => current ? {
      ...current,
      blocks: current.blocks.map((block) => block.id === id ? { ...block, ...patch } : block),
    } : current);
  }

  function moveBlock(index: number, direction: -1 | 1) {
    setPrescription((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.blocks.length) return current;
      const blocks = [...current.blocks];
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...current, blocks };
    });
  }

  function updateExercise(localId: string, patch: Partial<StrengthExerciseDraft>) {
    setExercises((current) => current.map((exercise) => exercise.localId === localId ? { ...exercise, ...patch } : exercise));
  }

  function moveExercise(index: number, direction: -1 | 1) {
    setExercises((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save() {
    if (!trainingType || !prescription || !isReady) {
      setError(t('offer.workout.error.incomplete'));
      return;
    }
    setError(null);
    setFeedback(null);
    const withStrengthDetails: WorkoutPrescription = {
      ...prescription,
      strengthExercises: trainingType === 'strength' ? exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        load: exercise.load,
        loadType: exercise.loadType,
        relativeLoad: exercise.relativeLoad,
        rpe: exercise.rpe,
        rir: exercise.rir,
        tempo: exercise.tempo,
        rangeOfMotion: exercise.rangeOfMotion,
        contraction: exercise.contraction,
        laterality: exercise.laterality,
        velocityLoss: exercise.velocityLoss,
      })) : undefined,
    };
    saveMutation.mutate({
      workoutId,
      trainingType,
      title: title.trim(),
      description: description.trim(),
      prescription: withStrengthDetails,
      exercises: exercises.map((exercise, position) => ({
        exercise_id: exercise.exerciseId,
        sets: Math.max(1, numberOr(exercise.sets, 1)),
        reps: exercise.reps.trim() || '1',
        rest_seconds: Math.max(0, numberOr(exercise.restSeconds, 0)),
        notes: exercise.notes.trim() || null,
        position,
      })),
    }, {
      onSuccess: (savedWorkoutId) => {
        setWorkoutId(savedWorkoutId);
        setFeedback(t('offer.workout.saved'));
      },
      onError: () => setError(t('offer.workout.error.save')),
    });
  }

  if (templateQuery.isLoading) {
    return <div className="flex min-h-32 items-center justify-center rounded-2xl bg-surface-container"><Loader2 size={24} className="animate-spin text-primary" aria-label={t('common.loading')} /></div>;
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-surface-container">
      <div className="flex items-center gap-3 border-b border-outline-variant/25 px-4 py-3">
        <StepBadge active={step === 1} complete={Boolean(trainingType)} value="1" />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-label text-on-surface">{t('offer.workout.step.type')}</p>
          <p className="font-sans text-body-sm text-on-surface-variant">{trainingType ? t(WORKOUT_TYPE_KEYS[trainingType]) : t('offer.workout.step.typeHint')}</p>
        </div>
        {trainingType && <button type="button" onClick={() => setStep(1)} className="min-h-11 rounded-full px-3 font-sans text-counter text-primary">{t('offer.workout.changeType')}</button>}
      </div>
      <div className="flex items-center gap-3 border-b border-outline-variant/25 px-4 py-3">
        <StepBadge active={step === 2} complete={Boolean(workoutId)} value="2" />
        <div>
          <p className="font-sans text-label text-on-surface">{t('offer.workout.step.builder')}</p>
          <p className="font-sans text-body-sm text-on-surface-variant">{t('offer.workout.step.builderHint')}</p>
        </div>
      </div>

      {step === 1 ? (
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
          {WORKOUT_TYPES.map((type) => {
            const Icon = TYPE_ICONS[type];
            return (
              <button key={type} type="button" onClick={() => chooseType(type)} className={clsx('flex min-h-[104px] flex-col items-start justify-between rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', trainingType === type ? 'border-primary bg-primary/10' : 'border-outline-variant/35 bg-surface-container-low hover:bg-surface-container-high')}>
                <Icon size={24} className="text-primary" aria-hidden />
                <span className="font-sans text-label text-on-surface">{t(WORKOUT_TYPE_KEYS[type])}</span>
              </button>
            );
          })}
        </div>
      ) : trainingType && prescription ? (
        <div className="space-y-7 p-4">
          <section className="space-y-4" aria-labelledby="workout-session-heading">
            <div>
              <h4 id="workout-session-heading" className="font-sans text-title text-on-surface">{t('offer.workout.session.title')}</h4>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('offer.workout.session.hint')}</p>
            </div>
            <TextField label={t('offer.workout.field.title')} value={title} maxLength={96} onChange={(event) => setTitle(event.target.value)} />
            <TextAreaField label={t('offer.workout.field.description')} value={description} maxLength={400} rows={2} onChange={(event) => setDescription(event.target.value)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={t('offer.workout.field.sessionType')} value={prescription.session.sessionType} placeholder={t('offer.workout.placeholder.sessionType')} onChange={(event) => updateSession('sessionType', event.target.value)} />
              <TextField label={t('offer.workout.field.objective')} value={prescription.session.objective} placeholder={t('offer.workout.placeholder.objective')} onChange={(event) => updateSession('objective', event.target.value)} />
              <TextField label={t('offer.workout.field.phase')} value={prescription.session.periodizationPhase} placeholder={t('offer.workout.placeholder.phase')} onChange={(event) => updateSession('periodizationPhase', event.target.value)} />
              <TextField label={t('offer.workout.field.duration')} value={prescription.session.estimatedDuration} placeholder={t('offer.workout.placeholder.duration')} onChange={(event) => updateSession('estimatedDuration', event.target.value)} />
              <TextField label={t('offer.workout.field.volume')} value={prescription.session.totalVolume} placeholder={t('offer.workout.placeholder.volume')} onChange={(event) => updateSession('totalVolume', event.target.value)} />
              <TextField label={t('offer.workout.field.intensityModel')} value={prescription.session.intensityModel} placeholder={t('offer.workout.placeholder.intensityModel')} onChange={(event) => updateSession('intensityModel', event.target.value)} />
              <TextField label={t('offer.workout.field.environment')} value={prescription.session.environment} placeholder={t('offer.workout.placeholder.environment')} onChange={(event) => updateSession('environment', event.target.value)} />
              <TextField label={t('offer.workout.field.equipment')} value={prescription.session.equipment} placeholder={t('offer.workout.placeholder.equipment')} onChange={(event) => updateSession('equipment', event.target.value)} />
            </div>
            <TextAreaField label={t('offer.workout.field.interruption')} value={prescription.session.interruptionCriteria} placeholder={t('offer.workout.placeholder.interruption')} rows={2} onChange={(event) => updateSession('interruptionCriteria', event.target.value)} />
          </section>

          <section className="border-t border-outline-variant/25 pt-6" aria-labelledby="workout-specific-heading">
            <h4 id="workout-specific-heading" className="font-sans text-title text-on-surface">{t('offer.workout.specific.title', { type: t(WORKOUT_TYPE_KEYS[trainingType]) })}</h4>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t(`offer.workout.specific.hint.${trainingType}`)}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {SPECIFIC_FIELDS[trainingType].map((specificField) => (
                <TextField key={specificField.key} label={t(specificField.label)} value={prescription.specifics[specificField.key] ?? ''} placeholder={t(specificField.placeholder)} onChange={(event) => updateSpecific(specificField.key, event.target.value)} />
              ))}
            </div>
          </section>

          {trainingType === 'strength' && (
            <StrengthExerciseBuilder
              exercises={exercises}
              search={search}
              onSearch={setSearch}
              results={exerciseSearch.data ?? []}
              isSearching={exerciseSearch.isFetching}
              onAdd={(item) => {
                if (!exercises.some((exercise) => exercise.exerciseId === item.id)) setExercises((current) => [...current, newStrengthExercise(item)]);
                setSearch('');
              }}
              onUpdate={updateExercise}
              onMove={moveExercise}
              onRemove={(localId) => setExercises((current) => current.filter((exercise) => exercise.localId !== localId))}
            />
          )}

          {trainingType !== 'strength' ? (
            <GuidedStepsEditor sport={trainingType} steps={prescription.steps ?? []} onChange={updateSteps} />
          ) : (
          <section className="border-t border-outline-variant/25 pt-6" aria-labelledby="workout-blocks-heading">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 id="workout-blocks-heading" className="font-sans text-title text-on-surface">{t('offer.workout.blocks.title')}</h4>
                <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('offer.workout.blocks.hint')}</p>
              </div>
              <button type="button" onClick={() => setPrescription((current) => current ? { ...current, blocks: [...current.blocks, createPrescriptionBlock()] } : current)} className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 font-sans text-counter text-primary"><Plus size={16} aria-hidden />{t('offer.workout.blocks.add')}</button>
            </div>
            <div className="mt-4 space-y-3">
              {prescription.blocks.map((block, index) => (
                <PrescriptionBlockEditor key={block.id} block={block} index={index} count={prescription.blocks.length} onUpdate={(patch) => updateBlock(block.id, patch)} onMove={(direction) => moveBlock(index, direction)} onRemove={() => setPrescription((current) => current ? { ...current, blocks: current.blocks.filter((item) => item.id !== block.id) } : current)} />
              ))}
            </div>
          </section>
          )}

          <section className="grid gap-3 border-t border-outline-variant/25 pt-6 sm:grid-cols-2">
            <TextAreaField label={t('offer.workout.field.monitoring')} value={prescription.session.monitoring} placeholder={t('offer.workout.placeholder.monitoring')} rows={2} onChange={(event) => updateSession('monitoring', event.target.value)} />
            <TextAreaField label={t('offer.workout.field.postRecovery')} value={prescription.session.postWorkoutRecovery} placeholder={t('offer.workout.placeholder.postRecovery')} rows={2} onChange={(event) => updateSession('postWorkoutRecovery', event.target.value)} />
          </section>

          {error && <p role="alert" className="font-sans text-body-sm text-error">{error}</p>}
          {feedback && <p role="status" className="font-sans text-body-sm text-primary">{feedback}</p>}
          <button type="button" disabled={saveMutation.isPending || !isReady} onClick={save} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-sans text-label text-on-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40">
            {saveMutation.isPending && <Loader2 size={18} className="animate-spin" aria-hidden />}
            {saveMutation.isPending ? t('profile.business.offers.saving') : t('offer.workout.save')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StepBadge({ active, complete, value }: { active: boolean; complete: boolean; value: string }) {
  return <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-sans text-counter', active || complete ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant')}>{value}</span>;
}

function StrengthExerciseBuilder({ exercises, search, onSearch, results, isSearching, onAdd, onUpdate, onMove, onRemove }: {
  exercises: StrengthExerciseDraft[];
  search: string;
  onSearch: (value: string) => void;
  results: ExerciseLibraryItem[];
  isSearching: boolean;
  onAdd: (item: ExerciseLibraryItem) => void;
  onUpdate: (id: string, patch: Partial<StrengthExerciseDraft>) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="border-t border-outline-variant/25 pt-6" aria-labelledby="strength-exercises-heading">
      <h4 id="strength-exercises-heading" className="font-sans text-title text-on-surface">{t('offer.workout.exercises.title')}</h4>
      <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('offer.workout.exercises.hint')}</p>
      <label className="mt-4 flex min-h-11 items-center gap-2 rounded-xl bg-surface-container-low px-3 ring-1 ring-outline-variant/40 focus-within:ring-primary">
        <Search size={18} className="shrink-0 text-on-surface-variant" aria-hidden />
        <span className="sr-only">{t('offer.workout.exercises.search')}</span>
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t('offer.workout.exercises.search')} className="min-w-0 flex-1 bg-transparent font-sans text-body text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none" />
        {isSearching && <Loader2 size={16} className="animate-spin text-primary" aria-hidden />}
      </label>
      {search.trim().length >= 2 && results.length > 0 && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-xl bg-surface-container-low p-1">
          {results.map((item) => (
            <button key={item.id} type="button" onClick={() => onAdd(item)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <span className="min-w-0 flex-1"><span className="block truncate font-sans text-label text-on-surface">{item.name}</span><span className="block truncate font-sans text-body-sm text-on-surface-variant">{[item.muscles[0], item.equipment].filter(Boolean).join(' · ')}</span></span>
              <Plus size={17} className="text-primary" aria-hidden />
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 space-y-3">
        {exercises.map((exercise, index) => (
          <article key={exercise.localId} className="rounded-xl bg-surface-container-low p-3">
            <div className="flex items-start gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-sans text-counter text-primary">{index + 1}</span>
              <div className="min-w-0 flex-1"><p className="font-sans text-label text-on-surface">{exercise.name}</p><p className="font-sans text-body-sm text-on-surface-variant">{exercise.muscle || t('offer.workout.exercises.noMuscle')}</p></div>
              <OrderButtons index={index} count={exercises.length} onMove={(direction) => onMove(index, direction)} />
              <button type="button" onClick={() => onRemove(exercise.localId)} aria-label={t('offer.workout.exercises.remove')} className="flex h-10 w-10 items-center justify-center rounded-full text-error"><Trash2 size={17} aria-hidden /></button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <CompactInput label={t('offer.workout.exercise.sets')} value={exercise.sets} inputMode="numeric" onChange={(value) => onUpdate(exercise.localId, { sets: value })} />
              <CompactInput label={t('offer.workout.exercise.reps')} value={exercise.reps} onChange={(value) => onUpdate(exercise.localId, { reps: value })} />
              <CompactInput label={t('offer.workout.exercise.rest')} value={exercise.restSeconds} inputMode="numeric" onChange={(value) => onUpdate(exercise.localId, { restSeconds: value })} />
            </div>
            <details className="mt-3 border-t border-outline-variant/25 pt-3">
              <summary className="cursor-pointer font-sans text-label text-primary">{t('offer.workout.exercise.advanced')}</summary>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <CompactInput label={t('offer.workout.exercise.load')} value={exercise.load} onChange={(value) => onUpdate(exercise.localId, { load: value })} />
                <CompactInput label={t('offer.workout.exercise.relativeLoad')} value={exercise.relativeLoad} onChange={(value) => onUpdate(exercise.localId, { relativeLoad: value })} />
                <CompactInput label="RPE" value={exercise.rpe} onChange={(value) => onUpdate(exercise.localId, { rpe: value })} />
                <CompactInput label="RIR" value={exercise.rir} onChange={(value) => onUpdate(exercise.localId, { rir: value })} />
                <CompactInput label={t('offer.workout.exercise.tempo')} value={exercise.tempo} onChange={(value) => onUpdate(exercise.localId, { tempo: value })} />
                <CompactInput label={t('offer.workout.exercise.rom')} value={exercise.rangeOfMotion} onChange={(value) => onUpdate(exercise.localId, { rangeOfMotion: value })} />
                <CompactInput label={t('offer.workout.exercise.contraction')} value={exercise.contraction} onChange={(value) => onUpdate(exercise.localId, { contraction: value })} />
                <CompactInput label={t('offer.workout.exercise.laterality')} value={exercise.laterality} onChange={(value) => onUpdate(exercise.localId, { laterality: value })} />
                <CompactInput label={t('offer.workout.exercise.velocityLoss')} value={exercise.velocityLoss} onChange={(value) => onUpdate(exercise.localId, { velocityLoss: value })} />
              </div>
              <label className="mt-2 block font-sans text-body-sm text-on-surface-variant">{t('offer.workout.exercise.notes')}<textarea value={exercise.notes} onChange={(event) => onUpdate(exercise.localId, { notes: event.target.value })} rows={2} className="mt-1 min-h-[72px] w-full resize-none rounded-lg bg-surface px-3 py-2 font-sans text-body text-on-surface outline-none ring-1 ring-outline-variant/40 focus:ring-primary" /></label>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}

function PrescriptionBlockEditor({ block, index, count, onUpdate, onMove, onRemove }: { block: PrescriptionBlock; index: number; count: number; onUpdate: (patch: Partial<PrescriptionBlock>) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <article className="rounded-xl bg-surface-container-low p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-sans text-counter text-primary">{index + 1}</span>
        <select value={block.role} onChange={(event) => onUpdate({ role: event.target.value as PrescriptionBlock['role'] })} className="min-h-10 min-w-0 flex-1 rounded-lg bg-surface px-2 font-sans text-label text-on-surface outline-none ring-1 ring-outline-variant/40 focus:ring-primary">
          {Object.entries(BLOCK_ROLE_KEYS).map(([role, key]) => <option key={role} value={role}>{t(key)}</option>)}
        </select>
        <OrderButtons index={index} count={count} onMove={onMove} />
        {count > 1 && <button type="button" onClick={onRemove} aria-label={t('offer.workout.blocks.remove')} className="flex h-10 w-10 items-center justify-center rounded-full text-error"><Trash2 size={17} aria-hidden /></button>}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <CompactInput label={t('offer.workout.block.name')} value={block.name} onChange={(value) => onUpdate({ name: value })} />
        <CompactInput label={t('offer.workout.block.task')} value={block.task} onChange={(value) => onUpdate({ task: value })} />
        <CompactInput label={t('offer.workout.block.series')} value={block.series} onChange={(value) => onUpdate({ series: value })} />
        <CompactInput label={t('offer.workout.block.repetitions')} value={block.repetitions} onChange={(value) => onUpdate({ repetitions: value })} />
        <CompactInput label={t('offer.workout.block.distance')} value={block.distance} onChange={(value) => onUpdate({ distance: value })} />
        <CompactInput label={t('offer.workout.block.duration')} value={block.duration} onChange={(value) => onUpdate({ duration: value })} />
        <CompactInput label={t('offer.workout.block.intensityType')} value={block.intensityType} onChange={(value) => onUpdate({ intensityType: value })} />
        <CompactInput label={t('offer.workout.block.intensityTarget')} value={block.intensityTarget} onChange={(value) => onUpdate({ intensityTarget: value })} />
        <CompactInput label={t('offer.workout.block.intensityRange')} value={block.intensityRange} onChange={(value) => onUpdate({ intensityRange: value })} />
        <CompactInput label={t('offer.workout.block.recoveryDuration')} value={block.recoveryDuration} onChange={(value) => onUpdate({ recoveryDuration: value })} />
        <CompactInput label={t('offer.workout.block.recoveryType')} value={block.recoveryType} onChange={(value) => onUpdate({ recoveryType: value })} />
        <CompactInput label={t('offer.workout.block.recoveryIntensity')} value={block.recoveryIntensity} onChange={(value) => onUpdate({ recoveryIntensity: value })} />
      </div>
      <details className="mt-3 border-t border-outline-variant/25 pt-3">
        <summary className="cursor-pointer font-sans text-label text-primary">{t('offer.workout.block.technicalDetails')}</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <CompactInput label={t('offer.workout.block.technique')} value={block.technique} onChange={(value) => onUpdate({ technique: value })} />
          <CompactInput label={t('offer.workout.block.equipment')} value={block.equipment} onChange={(value) => onUpdate({ equipment: value })} />
          <CompactInput label={t('offer.workout.block.progression')} value={block.progressionCriteria} onChange={(value) => onUpdate({ progressionCriteria: value })} />
          <CompactInput label={t('offer.workout.block.interruption')} value={block.interruptionCriteria} onChange={(value) => onUpdate({ interruptionCriteria: value })} />
        </div>
      </details>
    </article>
  );
}

function CompactInput({ label, value, onChange, inputMode }: { label: string; value: string; onChange: (value: string) => void; inputMode?: 'numeric' | 'decimal' }) {
  return <label className="block min-w-0 font-sans text-body-sm text-on-surface-variant"><span className="block truncate">{label}</span><input value={value} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg bg-surface px-2 font-sans text-body text-on-surface outline-none ring-1 ring-outline-variant/40 focus:ring-primary" /></label>;
}

function OrderButtons({ index, count, onMove }: { index: number; count: number; onMove: (direction: -1 | 1) => void }) {
  const { t } = useTranslation();
  return <span className="flex shrink-0"><button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label={t('offer.workout.moveUp')} className="flex h-10 w-8 items-center justify-center text-on-surface-variant disabled:opacity-30"><ChevronUp size={17} aria-hidden /></button><button type="button" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={t('offer.workout.moveDown')} className="flex h-10 w-8 items-center justify-center text-on-surface-variant disabled:opacity-30"><ChevronDown size={17} aria-hidden /></button></span>;
}
