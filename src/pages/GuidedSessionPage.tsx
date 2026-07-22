import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Dot, Gauge, Repeat, SkipForward, Timer, Waves, X, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useTraining } from '@/features/training/TrainingProvider';
import { useLogWorkoutSession } from '@/features/training/useWorkoutSessions';
import { flattenSteps, type Effort, type FlatStep, type GuidedSingleStep, type StepBound, type StepRole, type SwimStroke } from '@/features/training/guidedSession';
import type { WorkoutTrainingType } from '@/features/training/useStudentWorkouts';
import { useTranslation, type TranslationKey } from '@/i18n/I18nProvider';

const ENDURANCE: WorkoutTrainingType[] = ['running', 'walking', 'cycling'];

const formatClock = (seconds: number) =>
  `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;

const EFFORT_KEY: Record<Effort, TranslationKey> = {
  easy: 'meufit.training.guided.effort.easy',
  moderate: 'meufit.training.guided.effort.moderate',
  hard: 'meufit.training.guided.effort.hard',
  max: 'meufit.training.guided.effort.max',
  recover: 'meufit.training.guided.effort.recover',
};
const ROLE_KEY: Record<StepRole, TranslationKey> = {
  warmup: 'meufit.training.guided.role.warmup',
  activation: 'meufit.training.guided.role.activation',
  main: 'meufit.training.guided.role.main',
  recovery: 'meufit.training.guided.role.recovery',
  cooldown: 'meufit.training.guided.role.cooldown',
};
const CUE_KEY: Record<Effort, TranslationKey> = {
  easy: 'meufit.training.guided.cue.easy',
  moderate: 'meufit.training.guided.cue.moderate',
  hard: 'meufit.training.guided.cue.hard',
  max: 'meufit.training.guided.cue.max',
  recover: 'meufit.training.guided.cue.recover',
};
const STROKE_KEY: Record<SwimStroke, TranslationKey> = {
  free: 'meufit.training.guided.stroke.free',
  back: 'meufit.training.guided.stroke.back',
  breast: 'meufit.training.guided.stroke.breast',
  fly: 'meufit.training.guided.stroke.fly',
  medley: 'meufit.training.guided.stroke.medley',
  choice: 'meufit.training.guided.stroke.choice',
};
const strongEffort = (effort: Effort) => effort === 'hard' || effort === 'max';

function cueKey(step: GuidedSingleStep, isRest: boolean): TranslationKey {
  if (isRest) return 'meufit.training.guided.cue.rest';
  if (step.role === 'warmup') return 'meufit.training.guided.cue.warmup';
  if (step.role === 'cooldown') return 'meufit.training.guided.cue.recover';
  return CUE_KEY[step.target?.effort ?? 'moderate'];
}

function phaseWeight(bound: StepBound): number {
  if (bound.by === 'time') return bound.seconds;
  if (bound.by === 'reps') return bound.reps * 4;
  if (bound.by === 'distance') return bound.meters / 3; // ~aprox p/ proporção visual
  return 60;
}

/** Duração planejada de uma fase, em segundos (estima passos por distância/reps). */
function plannedSeconds(phase: Phase): number {
  const b = phase.bound;
  if (b.by === 'time') return b.seconds;
  if (b.by === 'reps') return b.reps * 4;
  if (b.by === 'distance') return Math.round((b.meters / 1000) * (phase.step.target?.paceSecPerKm ?? 360));
  return 60;
}

const parseClock = (value: string): number => {
  const m = value.trim().match(/^(\d{1,3}):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Math.min(59, Number(m[2]));
  const n = Number(value.replace(/\D/g, ''));
  return Number.isFinite(n) ? n : 0;
};

interface ReviewStep { label: string; role: StepRole; metaSec: number; realizedSec: number }
interface ReviewModel { startedAt: number; steps: ReviewStep[] }

// Uma fase = trabalho de um passo ou a recuperação que vem logo depois.
interface Phase {
  type: 'work' | 'rest';
  step: GuidedSingleStep;
  bound: StepBound;
  repeatLabel?: string;
  workIndex: number;
}

function buildPhases(flat: FlatStep[]): Phase[] {
  const phases: Phase[] = [];
  let workIndex = 0;
  for (const { step, repeatLabel } of flat) {
    phases.push({ type: 'work', step, bound: step.bound, repeatLabel, workIndex });
    if (step.rest && step.rest.by === 'time' && step.rest.seconds > 0) {
      phases.push({ type: 'rest', step, bound: step.rest, repeatLabel, workIndex });
    }
    workIndex += 1;
  }
  return phases;
}

export function GuidedSessionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const training = useTraining();
  const logSession = useLogWorkoutSession();
  const guided = training.activeGuided;

  const phases = useMemo(() => (guided ? buildPhases(flattenSteps(guided.plan.steps)) : []), [guided]);
  const workPhases = useMemo(() => phases.filter((phase) => phase.type === 'work'), [phases]);
  const totalWorkSteps = workPhases.length;

  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseStartedAt, setPhaseStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [splits, setSplits] = useState<{ label: string; seconds: number }[]>([]);
  const [viewMode, setViewMode] = useState<'guided' | 'list'>('guided');
  const [review, setReview] = useState<ReviewModel | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  // Modo Lista: tempo (segundos desde o início) carimbado ao marcar cada linha.
  const [checkedAt, setCheckedAt] = useState<Record<number, number>>({});

  const phasesRef = useRef(phases);
  const phaseIndexRef = useRef(phaseIndex);
  const phaseStartedAtRef = useRef(phaseStartedAt);
  const splitsRef = useRef<{ label: string; seconds: number }[]>([]);
  const viewModeRef = useRef(viewMode);
  const workPhasesRef = useRef(workPhases);
  const checkedAtRef = useRef(checkedAt);

  const toggleCheck = useCallback((rowIndex: number) => {
    if (!guided) return;
    const stamp = Math.max(0, Math.floor((Date.now() - guided.startedAt) / 1000));
    setCheckedAt((current) => {
      const nextValue = { ...current };
      if (nextValue[rowIndex] != null) delete nextValue[rowIndex]; else nextValue[rowIndex] = stamp;
      checkedAtRef.current = nextValue;
      return nextValue;
    });
  }, [guided]);

  // Abre o resumo editável (meta × realizado); ainda não grava — só ao salvar.
  const openReview = useCallback(() => {
    if (!guided) return;
    const allPhases = phasesRef.current;
    const workListIndex: number[] = [];
    allPhases.forEach((entry, i) => { if (entry.type === 'work') workListIndex.push(i); });
    const checks = checkedAtRef.current;
    const checkedIndices = Object.keys(checks).map(Number).sort((a, b) => a - b);
    const steps: ReviewStep[] = workPhasesRef.current.map((wp, k) => {
      const meta = plannedSeconds(wp);
      // Precedência do realizado: check da Lista → parcial do modo Guiado → planejado.
      let realized = splitsRef.current[k]?.seconds ?? meta;
      const li = workListIndex[k];
      if (li != null && checks[li] != null) {
        const prev = checkedIndices.filter((x) => x < li).pop();
        realized = Math.max(1, checks[li] - (prev != null ? checks[prev] : 0));
      }
      return { label: wp.step.label ?? '', role: wp.step.role, metaSec: meta, realizedSec: realized };
    });
    setReview({ startedAt: guided.startedAt, steps });
  }, [guided]);

  const advance = useCallback(() => {
    const index = phaseIndexRef.current;
    const leaving = phasesRef.current[index];
    if (leaving && leaving.type === 'work') {
      const elapsed = Math.max(0, Math.round((Date.now() - phaseStartedAtRef.current) / 1000));
      splitsRef.current = [...splitsRef.current, { label: leaving.step.label ?? '', seconds: elapsed }];
      setSplits(splitsRef.current);
    }
    const next = index + 1;
    phaseIndexRef.current = next;
    if (next >= phasesRef.current.length) {
      openReview();
      return;
    }
    setPhaseIndex(next);
    setPhaseStartedAt(Date.now());
  }, [openReview]);

  useEffect(() => {
    phasesRef.current = phases;
    phaseIndexRef.current = phaseIndex;
    phaseStartedAtRef.current = phaseStartedAt;
    viewModeRef.current = viewMode;
    workPhasesRef.current = workPhases;
    checkedAtRef.current = checkedAt;
  }, [phases, phaseIndex, phaseStartedAt, viewMode, workPhases, checkedAt]);

  useEffect(() => {
    if (review) return undefined;
    const id = window.setInterval(() => {
      // No modo Lista o relógio só corre (glanceable); não auto-avança nem finaliza.
      if (viewModeRef.current === 'guided') {
        const current = phasesRef.current[phaseIndexRef.current];
        if (current && current.bound.by === 'time') {
          const elapsed = Math.floor((Date.now() - phaseStartedAtRef.current) / 1000);
          if (elapsed >= current.bound.seconds) { advance(); return; }
        }
      }
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [review, advance]);

  if (review) {
    return (
      <EditableReview
        model={review}
        onSave={(totalSec) => {
          if (guided?.workoutId) {
            logSession.mutate({
              workoutId: guided.workoutId,
              assignmentId: guided.assignmentId ?? null,
              startedAt: new Date(review.startedAt).toISOString(),
              completedAt: new Date(review.startedAt + totalSec * 1000).toISOString(),
              exercisesDone: totalWorkSteps,
              exercisesTotal: totalWorkSteps,
            });
          }
          training.completeGuided();
          navigate('/meu-fit/treino');
        }}
      />
    );
  }

  if (!guided || !phases.length) {
    return (
      <div className="flex h-full flex-col bg-background px-5 pb-safe-bottom pt-safe-top">
        <button type="button" onClick={() => navigate('/meu-fit/treino')} aria-label={t('common.back')} className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface">
          <ArrowLeft size={22} aria-hidden />
        </button>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Timer className="text-primary" size={40} aria-hidden />
          <h1 className="mt-5 font-sans text-title-lg text-on-surface">{t('meufit.training.guided.emptyTitle')}</h1>
          <p className="mt-2 max-w-[18rem] font-sans text-body-sm text-on-surface-variant">{t('meufit.training.guided.emptyDescription')}</p>
        </div>
      </div>
    );
  }

  const phase = phases[Math.min(phaseIndex, phases.length - 1)];
  const phaseElapsed = Math.floor((now - phaseStartedAt) / 1000);
  const isTimed = phase.bound.by === 'time';
  const targetSeconds = phase.bound.by === 'time' ? phase.bound.seconds : 0;
  const remaining = isTimed ? Math.max(0, targetSeconds - phaseElapsed) : 0;
  const totalElapsed = Math.floor((now - guided.startedAt) / 1000);
  const nextWork = phases.slice(phaseIndex + 1).find((entry) => entry.type === 'work');
  const progress = isTimed && targetSeconds > 0 ? Math.min(100, (phaseElapsed / targetSeconds) * 100) : 0;
  const effort = phase.step.target?.effort ?? 'moderate';
  const isRest = phase.type === 'rest';
  const endurance = ENDURANCE.includes(guided.surface);
  const swim = guided.surface === 'swimming';
  const hiit = guided.surface === 'hiit' || guided.surface === 'functional';
  // Movimentos da rodada atual (irmãos dentro do bloco repeat) para o checklist HIIT.
  // Cálculo simples pós-guards (não é hook) — evita chamada condicional de hook.
  const roundMovements = ((): GuidedSingleStep[] => {
    for (const step of guided.plan.steps) {
      if (step.kind === 'repeat' && step.steps.some((inner) => inner.id === phase.step.id)) return step.steps;
    }
    return [phase.step];
  })();
  const countdown = isTimed && remaining <= 3 && remaining > 0;
  const isLast = phaseIndex + 1 >= phases.length;
  const pace = phase.step.target?.paceSecPerKm;
  const cadence = phase.step.target?.cadence;

  const primaryLabel = isLast ? t('meufit.training.guided.finish') : isTimed ? t('meufit.training.guided.skip') : isRest ? t('meufit.training.guided.next') : (swim ? t('meufit.training.guided.lapDone') : t('meufit.training.guided.nextDone'));
  const primaryIcon = isLast ? <Check size={18} aria-hidden /> : isTimed ? <SkipForward size={18} aria-hidden /> : <Check size={18} aria-hidden />;

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between px-4 pb-2 pt-safe-top">
        <button type="button" onClick={() => setExitOpen(true)} aria-label={t('meufit.training.guided.exit')} className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface active:bg-surface-container-high">
          <X size={22} aria-hidden />
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate font-sans text-label text-on-surface">{guided.title}</p>
          <p className="mt-0.5 font-sans text-counter tabular-nums text-on-surface-variant">{formatClock(totalElapsed)}</p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center font-sans text-counter tabular-nums text-on-surface-variant">{phase.workIndex + 1}/{totalWorkSteps}</span>
      </header>

      {/* Alternador de visualização: Guiado × Lista */}
      <div className="mb-1 flex justify-center px-4">
        <div className="inline-flex rounded-full bg-surface-container p-0.5">
          <button type="button" onClick={() => setViewMode('guided')} className={clsx('min-h-8 rounded-full px-3 font-sans text-counter transition-colors', viewMode === 'guided' ? 'bg-primary text-on-primary' : 'text-on-surface-variant')}>{t('meufit.training.guided.viewGuided')}</button>
          <button type="button" onClick={() => setViewMode('list')} className={clsx('min-h-8 rounded-full px-3 font-sans text-counter transition-colors', viewMode === 'list' ? 'bg-primary text-on-primary' : 'text-on-surface-variant')}>{t('meufit.training.guided.viewList')}</button>
        </div>
      </div>

      {/* Mapa de intervalos (endurance) ou trilha simples — só no modo Guiado */}
      {viewMode === 'guided' && (endurance ? (
        <div className="flex items-end gap-1 px-4" style={{ height: '22px' }}>
          {workPhases.map((wp, index) => {
            const done = index < phase.workIndex;
            const current = index === phase.workIndex && !isRest;
            const strong = strongEffort(wp.step.target?.effort ?? 'moderate');
            return (
              <span key={index} className="relative flex-1 overflow-hidden rounded-full bg-surface-container-high" style={{ flexGrow: Math.max(1, phaseWeight(wp.bound)), height: strong ? '14px' : '9px' }}>
                {done ? <span className="absolute inset-0 rounded-full bg-primary/80" /> : null}
                {current ? <span className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} /> : null}
              </span>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-1 px-4">
          {workPhases.map((_, index) => (
            <span key={index} className={clsx('h-1 flex-1 rounded-full', index < phase.workIndex ? 'bg-primary' : index === phase.workIndex ? 'bg-primary/50' : 'bg-surface-container-high')} />
          ))}
        </div>
      ))}

      {viewMode === 'list' ? (
        <ListSessionMain phases={phases} totalElapsed={totalElapsed} checkedAt={checkedAt} onToggle={toggleCheck} />
      ) : swim ? (
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <span className={clsx('font-sans text-label uppercase tracking-[0.14em]', isRest ? 'text-on-surface-variant' : 'text-primary')}>
          {isRest ? t('meufit.training.guided.rest') : t(ROLE_KEY[phase.step.role])}
          {phase.repeatLabel ? ` · ${phase.repeatLabel}` : ''}
        </span>
        {isRest ? (
          <>
            <p className="mt-5 font-sans tabular-nums text-primary" style={{ fontSize: 'clamp(3.25rem, 20vw, 5.5rem)', lineHeight: 1 }}>{formatClock(remaining)}</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.guided.swimRest')}</p>
          </>
        ) : (
          <>
            <p className="mt-5 font-sans tabular-nums text-on-surface" style={{ fontSize: 'clamp(3.25rem, 20vw, 5.5rem)', lineHeight: 1 }}>{phase.bound.by === 'distance' ? formatDistance(phase.bound.meters) : isTimed ? formatClock(remaining) : t('meufit.training.guided.byOpen')}</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-4 py-2 font-sans text-label text-on-surface"><Waves size={15} aria-hidden />{t(STROKE_KEY[phase.step.sport?.stroke ?? 'free'])}</span>
              <span className={clsx('inline-flex items-center rounded-full px-4 py-2 font-sans text-label', strongEffort(effort) ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface')}>{t(EFFORT_KEY[effort])}</span>
            </div>
            {phase.step.rest?.by === 'time' ? <p className="mt-3 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.guided.restAfter', { n: phase.step.rest.seconds })}</p> : null}
          </>
        )}
        <p className="mt-4 max-w-[22rem] font-sans text-body text-on-surface-variant">{phase.step.note?.trim() ? phase.step.note : t(cueKey(phase.step, isRest))}</p>
      </main>
      ) : hiit ? (
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="inline-flex items-center gap-1.5 font-sans text-label uppercase tracking-[0.14em] text-primary">
          <Zap size={13} aria-hidden />
          {isRest ? t('meufit.training.guided.rest') : phase.repeatLabel ? t('meufit.training.guided.roundLabel', { label: phase.repeatLabel }) : t(ROLE_KEY[phase.step.role])}
        </span>
        {phase.step.label && !isRest ? <h1 className="mt-2 text-balance font-sans text-title-lg text-on-surface">{phase.step.label}</h1> : null}
        <p className={clsx('mt-4 font-sans tabular-nums', countdown ? 'text-primary' : 'text-on-surface')} style={{ fontSize: 'clamp(3.25rem, 20vw, 5.5rem)', lineHeight: 1 }}>
          {phase.bound.by === 'reps' ? `${phase.bound.reps}` : isTimed ? formatClock(remaining) : formatClock(phaseElapsed)}
        </p>
        <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{phase.bound.by === 'reps' ? t('meufit.training.guided.repsLabel') : isRest ? t('meufit.training.guided.swimRest') : boundLabel(phase.bound, t)}</p>
        {!isRest ? <span className={clsx('mt-5 inline-flex items-center rounded-full px-4 py-2 font-sans text-label', strongEffort(effort) ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface')}>{t(EFFORT_KEY[effort])}</span> : null}
        {roundMovements.length > 1 ? (
          <ul className="mt-6 w-full max-w-xs space-y-1.5">
            {roundMovements.map((mv) => {
              const current = mv.id === phase.step.id && !isRest;
              return (
                <li key={mv.id} className={clsx('flex items-center gap-2 rounded-xl px-3 py-2 font-sans text-body-sm', current ? 'bg-primary/12 text-on-surface' : 'text-on-surface-variant')}>
                  <Dot size={18} className={clsx('shrink-0', current ? 'text-primary' : 'text-on-surface-variant')} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-left">{mv.label || t(ROLE_KEY[mv.role])}</span>
                  <span className="shrink-0 tabular-nums text-on-surface-variant">{mv.bound.by === 'reps' ? t('meufit.training.guided.byReps', { n: mv.bound.reps }) : mv.bound.by === 'time' ? formatClock(mv.bound.seconds) : ''}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 max-w-[22rem] font-sans text-body text-on-surface-variant">{phase.step.note?.trim() ? phase.step.note : t(cueKey(phase.step, isRest))}</p>
        )}
      </main>
      ) : (
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <span className={clsx('inline-flex items-center gap-1.5 font-sans text-label uppercase tracking-[0.14em]', isRest ? 'text-on-surface-variant' : 'text-primary')}>
          {isRest ? t('meufit.training.guided.rest') : t(ROLE_KEY[phase.step.role])}
          {phase.repeatLabel ? <span className="inline-flex items-center gap-1 text-on-surface-variant"><Repeat size={12} aria-hidden />{phase.repeatLabel}</span> : null}
        </span>

        {phase.step.label && !isRest ? <h1 className="mt-2 text-balance font-sans text-title-lg text-on-surface">{phase.step.label}</h1> : null}

        <p className={clsx('mt-5 font-sans tabular-nums transition-colors', countdown ? 'text-primary' : 'text-on-surface')} style={{ fontSize: 'clamp(3.25rem, 20vw, 5.5rem)', lineHeight: 1 }}>
          {isTimed ? formatClock(remaining) : phase.bound.by === 'reps' ? `${phase.bound.reps}` : phase.bound.by === 'distance' ? formatDistance(phase.bound.meters) : formatClock(phaseElapsed)}
        </p>
        <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{isTimed ? t('meufit.training.guided.byTime') : boundLabel(phase.bound, t)}</p>

        {/* Alvo: esforço + (opcional) pace/cadência */}
        {!isRest ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className={clsx('inline-flex items-center rounded-full px-4 py-2 font-sans text-label', strongEffort(effort) ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface')}>{t(EFFORT_KEY[effort])}</span>
            {pace ? <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-2 font-sans text-label tabular-nums text-on-surface"><Gauge size={15} aria-hidden />{t('meufit.training.guided.pacePerKm', { pace: formatClock(pace) })}</span> : null}
            {cadence ? <span className="inline-flex items-center rounded-full bg-surface-container-high px-3 py-2 font-sans text-counter tabular-nums text-on-surface">{t('meufit.training.guided.cadence', { n: cadence })}</span> : null}
          </div>
        ) : null}

        {/* Frase de coaching */}
        <p className="mt-4 max-w-[22rem] font-sans text-body text-on-surface-variant">{phase.step.note?.trim() ? phase.step.note : t(cueKey(phase.step, isRest))}</p>

        {/* Parciais (endurance) */}
        {endurance && splits.length > 0 ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <span className="font-sans text-counter uppercase tracking-wide text-on-surface-variant">{t('meufit.training.guided.splits')}</span>
            {splits.slice(-4).map((split, index) => (
              <span key={index} className="font-sans text-body-sm tabular-nums text-on-surface">{formatClock(split.seconds)}</span>
            ))}
          </div>
        ) : null}
      </main>
      )}

      {nextWork && viewMode === 'guided' ? (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-2xl bg-surface-container px-4 py-2.5">
          <ChevronRight size={16} className="shrink-0 text-on-surface-variant" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-sans text-body-sm text-on-surface-variant">
            <span className="text-on-surface">{t('meufit.training.guided.next')}:</span> {nextWork.step.label || t(ROLE_KEY[nextWork.step.role])} · {t(EFFORT_KEY[nextWork.step.target?.effort ?? 'moderate'])} · {boundLabel(nextWork.bound, t)}
          </span>
        </div>
      ) : null}

      <footer className="shrink-0 px-4 pb-safe-bottom pt-2">
        <button
          type="button"
          onClick={viewMode === 'list' ? openReview : advance}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-primary font-sans text-label text-on-primary transition-opacity duration-150 hover:opacity-90 active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {viewMode === 'list' ? <><Check size={18} aria-hidden />{t('meufit.training.guided.finish')}</> : <>{primaryIcon}{primaryLabel}</>}
        </button>
      </footer>

      <BottomSheet open={exitOpen} onClose={() => setExitOpen(false)} title={t('meufit.training.guided.exitTitle')} description={t('meufit.training.guided.exitDescription')}>
        <div className="px-5 pb-6">
          <button type="button" onClick={() => setExitOpen(false)} className="min-h-12 w-full rounded-full bg-primary font-sans text-label text-on-primary">{t('meufit.training.guided.exitStay')}</button>
          <button type="button" onClick={() => { training.cancelGuided(); navigate('/meu-fit/treino'); }} className="mt-3 min-h-12 w-full rounded-full border border-outline-variant/40 font-sans text-label text-on-surface">{t('meufit.training.guided.exitLeave')}</button>
        </div>
      </BottomSheet>
    </div>
  );
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(Math.round((meters / 1000) * 100) / 100).toLocaleString('pt-BR')} km` : `${meters} m`;
}

function boundLabel(bound: StepBound, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string {
  if (bound.by === 'time') return t('meufit.training.guided.byTime');
  if (bound.by === 'distance') return formatDistance(bound.meters);
  if (bound.by === 'reps') return t('meufit.training.guided.byReps', { n: bound.reps });
  return t('meufit.training.guided.byOpen');
}

/** Visão Lista/timeline: sessão inteira; o relógio corre sozinho e mostra onde
 *  você deveria estar. Glanceable (natação, mãos molhadas etc.) — sem tocar por passo. */
function ListSessionMain({ phases, totalElapsed, checkedAt, onToggle }: { phases: Phase[]; totalElapsed: number; checkedAt: Record<number, number>; onToggle: (rowIndex: number) => void }) {
  const { t } = useTranslation();
  const rows = phases.reduce<{ phase: Phase; start: number; end: number; dur: number }[]>((acc, p) => {
    const start = acc.length ? acc[acc.length - 1].end : 0;
    const dur = plannedSeconds(p);
    acc.push({ phase: p, start, end: start + dur, dur });
    return acc;
  }, []);
  const totalPlanned = rows.length ? rows[rows.length - 1].end : 0;
  const expectedIndex = rows.findIndex((r) => totalElapsed < r.end);
  const currentRow = expectedIndex >= 0 ? rows[expectedIndex] : null;
  const checkedIndices = Object.keys(checkedAt).map(Number).sort((a, b) => a - b);
  // Tempo de cada linha marcada = do check anterior até este.
  const segmentFor = (rowIndex: number): number | null => {
    if (checkedAt[rowIndex] == null) return null;
    const prev = checkedIndices.filter((x) => x < rowIndex).pop();
    return Math.max(0, checkedAt[rowIndex] - (prev != null ? checkedAt[prev] : 0));
  };
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
      <div className="mb-4 rounded-2xl bg-surface-container p-4 text-center">
        <p className="font-sans text-counter uppercase tracking-wide text-on-surface-variant">{t('meufit.training.guided.listAhead')}</p>
        <p className="mt-1 font-sans text-title-lg text-on-surface">{currentRow ? (currentRow.phase.type === 'rest' ? t('meufit.training.guided.rest') : (currentRow.phase.step.label || t(ROLE_KEY[currentRow.phase.step.role]))) : t('meufit.training.guided.listDoneAll')}</p>
        <p className="mt-1 font-sans text-body-sm tabular-nums text-on-surface-variant">{formatClock(totalElapsed)} / {t('meufit.training.guided.listPlannedTotal', { time: formatClock(totalPlanned) })}</p>
      </div>
      <ol className="space-y-2 pb-4">
        {rows.map((r, index) => {
          const current = index === expectedIndex;
          const behind = current ? Math.min(100, ((totalElapsed - r.start) / Math.max(1, r.dur)) * 100) : 0;
          const rest = r.phase.type === 'rest';
          const effort = r.phase.step.target?.effort ?? 'moderate';
          const checked = checkedAt[index] != null;
          const segment = segmentFor(index);
          const measure = r.phase.bound.by === 'time' ? formatClock(r.phase.bound.seconds) : r.phase.bound.by === 'distance' ? formatDistance(r.phase.bound.meters) : r.phase.bound.by === 'reps' ? t('meufit.training.guided.byReps', { n: r.phase.bound.reps }) : formatClock(r.dur);
          return (
            <li key={index} className={clsx('relative overflow-hidden rounded-xl border', checked ? 'border-primary/50' : current ? 'border-primary' : 'border-outline-variant/30', rest ? 'bg-surface-container/50' : 'bg-surface-container')}>
              {current && !checked ? <span className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${behind}%` }} aria-hidden /> : null}
              <div className="relative flex items-center gap-3 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => onToggle(index)}
                  aria-pressed={checked}
                  aria-label={r.phase.step.label || t(ROLE_KEY[r.phase.step.role])}
                  className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors', checked ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant/60 text-transparent')}
                >
                  <Check size={15} aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                  <p className={clsx('truncate font-sans text-label', checked ? 'text-on-surface-variant line-through' : 'text-on-surface')}>{rest ? t('meufit.training.guided.rest') : (r.phase.step.label || t(ROLE_KEY[r.phase.step.role]))}{r.phase.repeatLabel ? ` · ${r.phase.repeatLabel}` : ''}</p>
                  {!rest ? <p className="truncate font-sans text-body-sm text-on-surface-variant">{t(EFFORT_KEY[effort])}</p> : null}
                </div>
                <span className="shrink-0 text-right">
                  {segment != null ? <span className="block font-sans text-label tabular-nums text-primary">{formatClock(segment)}</span> : null}
                  <span className="block font-sans text-counter tabular-nums text-on-surface-variant">{measure}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

/** Resumo editável ao concluir: meta × realizado por etapa + tempo total. Provisório
 *  até os dados do relógio (Apple Health) refinarem. */
function EditableReview({ model, onSave }: { model: ReviewModel; onSave: (totalSec: number) => void }) {
  const { t } = useTranslation();
  const [values, setValues] = useState<string[]>(() => model.steps.map((step) => formatClock(step.realizedSec)));
  const totalSec = values.reduce((acc, value) => acc + parseClock(value), 0);
  return (
    <div className="flex h-full flex-col bg-background pt-safe-top">
      <header className="px-5 pb-2 pt-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary"><Check size={26} aria-hidden /></div>
        <h1 className="mt-3 text-center font-sans text-title-lg text-on-surface">{t('meufit.training.guided.summaryTitle')}</h1>
        <p className="mt-1 text-center font-sans text-body-sm text-on-surface-variant">{t('meufit.training.guided.metaVsDone')}</p>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-surface-container px-4 py-3">
          <span className="font-sans text-label text-on-surface">{t('meufit.training.guided.total')}</span>
          <span className="font-sans text-title-lg tabular-nums text-primary">{formatClock(totalSec)}</span>
        </div>
        <ul className="space-y-2">
          {model.steps.map((step, index) => (
            <li key={index} className="flex items-center gap-3 rounded-xl bg-surface-container px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-label text-on-surface">{step.label || t(ROLE_KEY[step.role])}</p>
                <p className="font-sans text-counter tabular-nums text-on-surface-variant">{t('meufit.training.guided.meta')} {formatClock(step.metaSec)}</p>
              </div>
              <input
                value={values[index]}
                inputMode="numeric"
                aria-label={step.label || t(ROLE_KEY[step.role])}
                onChange={(event) => setValues((current) => current.map((value, idx) => (idx === index ? event.target.value : value)))}
                className="w-20 rounded-lg bg-surface px-2 py-2 text-center font-sans text-body tabular-nums text-on-surface outline-none ring-1 ring-outline-variant/40 focus:ring-primary"
              />
            </li>
          ))}
        </ul>
        <p className="mt-4 font-sans text-counter text-on-surface-variant">{t('meufit.training.guided.summaryWearableHint')}</p>
      </main>
      <footer className="shrink-0 px-5 pb-safe-bottom pt-2">
        <button type="button" onClick={() => onSave(Math.max(1, totalSec))} className="min-h-12 w-full rounded-full bg-primary font-sans text-label text-on-primary transition-opacity hover:opacity-90 active:opacity-80">{t('meufit.training.guided.reviewSave')}</button>
      </footer>
    </div>
  );
}
