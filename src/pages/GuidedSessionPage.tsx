import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Gauge, Repeat, SkipForward, Timer, Waves, X } from 'lucide-react';
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
  const [summary, setSummary] = useState<{ durationSec: number; steps: number } | null>(null);
  const [exitOpen, setExitOpen] = useState(false);

  const phasesRef = useRef(phases);
  const phaseIndexRef = useRef(phaseIndex);
  const phaseStartedAtRef = useRef(phaseStartedAt);

  const finish = useCallback(() => {
    if (!guided) return;
    const durationSec = Math.max(1, Math.round((Date.now() - guided.startedAt) / 1000));
    if (guided.workoutId) {
      logSession.mutate({
        workoutId: guided.workoutId,
        assignmentId: guided.assignmentId ?? null,
        startedAt: new Date(guided.startedAt).toISOString(),
        exercisesDone: totalWorkSteps,
        exercisesTotal: totalWorkSteps,
      });
    }
    training.completeGuided();
    setSummary({ durationSec, steps: totalWorkSteps });
  }, [guided, logSession, totalWorkSteps, training]);

  const advance = useCallback(() => {
    const index = phaseIndexRef.current;
    const leaving = phasesRef.current[index];
    // Registra a parcial (tempo real do trecho) ao sair de um passo de trabalho.
    if (leaving && leaving.type === 'work') {
      const elapsed = Math.max(0, Math.round((Date.now() - phaseStartedAtRef.current) / 1000));
      setSplits((current) => [...current, { label: leaving.step.label ?? '', seconds: elapsed }]);
    }
    const next = index + 1;
    phaseIndexRef.current = next;
    if (next >= phasesRef.current.length) {
      finish();
      return;
    }
    setPhaseIndex(next);
    setPhaseStartedAt(Date.now());
  }, [finish]);

  useEffect(() => {
    phasesRef.current = phases;
    phaseIndexRef.current = phaseIndex;
    phaseStartedAtRef.current = phaseStartedAt;
  }, [phases, phaseIndex, phaseStartedAt]);

  useEffect(() => {
    if (summary) return undefined;
    const id = window.setInterval(() => {
      const current = phasesRef.current[phaseIndexRef.current];
      if (current && current.bound.by === 'time') {
        const elapsed = Math.floor((Date.now() - phaseStartedAtRef.current) / 1000);
        if (elapsed >= current.bound.seconds) { advance(); return; }
      }
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [summary, advance]);

  if (summary) {
    return <GuidedSummary durationSec={summary.durationSec} steps={summary.steps} onClose={() => navigate('/meu-fit/treino')} />;
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

      {/* Mapa de intervalos (endurance) ou trilha simples */}
      {endurance ? (
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
      )}

      {swim ? (
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

      {nextWork ? (
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
          onClick={advance}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-primary font-sans text-label text-on-primary transition-opacity duration-150 hover:opacity-90 active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {primaryIcon}
          {primaryLabel}
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

function GuidedSummary({ durationSec, steps, onClose }: { durationSec: number; steps: number; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col bg-background px-5 pb-safe-bottom pt-safe-top">
      <div className="flex justify-end">
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface active:bg-surface-container-high">
          <X size={22} aria-hidden />
        </button>
      </div>
      <main className="flex flex-1 flex-col justify-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary text-on-primary">
          <Check size={34} aria-hidden />
        </div>
        <h1 className="mt-6 text-center font-sans text-display text-on-surface">{t('meufit.training.guided.summaryTitle')}</h1>
        <p className="mt-2 text-center font-sans text-body-sm text-on-surface-variant">{t('meufit.training.guided.summarySubtitle')}</p>
        <div className="mx-auto mt-8 grid w-full max-w-sm grid-cols-2 gap-3">
          <div className="rounded-2xl border border-outline-variant/35 bg-surface-container p-4">
            <p className="font-sans text-title-lg tabular-nums text-on-surface">{formatClock(durationSec)}</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.guided.summaryDuration')}</p>
          </div>
          <div className="rounded-2xl border border-outline-variant/35 bg-surface-container p-4">
            <p className="font-sans text-title-lg tabular-nums text-on-surface">{steps}</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.guided.summarySteps')}</p>
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-sm text-center font-sans text-counter text-on-surface-variant">{t('meufit.training.guided.summaryWearableHint')}</p>
      </main>
      <button type="button" onClick={onClose} className="min-h-12 rounded-full bg-primary font-sans text-label text-on-primary">{t('meufit.training.guided.summaryBack')}</button>
    </div>
  );
}
