import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, SkipForward, Timer, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useTraining } from '@/features/training/TrainingProvider';
import { useLogWorkoutSession } from '@/features/training/useWorkoutSessions';
import { flattenSteps, type Effort, type FlatStep, type GuidedSingleStep, type StepBound, type StepRole } from '@/features/training/guidedSession';
import { useTranslation, type TranslationKey } from '@/i18n/I18nProvider';

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
/** Esforço "quente" ganha a cor de ação (lime); leve/recuperar ficam tonais. */
const strongEffort = (effort: Effort) => effort === 'hard' || effort === 'max';

// Uma fase = trabalho de um passo ou a recuperação que vem logo depois.
interface Phase {
  type: 'work' | 'rest';
  step: GuidedSingleStep;
  bound: StepBound;
  repeatLabel?: string;
  workIndex: number; // índice do passo de trabalho (para progresso)
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
  const totalWorkSteps = useMemo(() => phases.filter((phase) => phase.type === 'work').length, [phases]);

  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseStartedAt, setPhaseStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [summary, setSummary] = useState<{ durationSec: number; steps: number } | null>(null);
  const [exitOpen, setExitOpen] = useState(false);

  // Refs para o tick/avanço não capturarem estado velho.
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
    const next = phaseIndexRef.current + 1;
    phaseIndexRef.current = next; // imediato: evita avançar duas vezes no mesmo tique
    if (next >= phases.length) {
      finish();
      return;
    }
    setPhaseIndex(next);
    setPhaseStartedAt(Date.now());
  }, [phases.length, finish]);

  const phase = phases[phaseIndex];
  const phaseElapsed = Math.floor((now - phaseStartedAt) / 1000);
  const isTimed = phase?.bound.by === 'time';
  const targetSeconds = phase?.bound.by === 'time' ? phase.bound.seconds : 0;
  const remaining = isTimed ? Math.max(0, targetSeconds - phaseElapsed) : 0;

  // Sincroniza os refs do tick (escritas em effect, não no render).
  useEffect(() => {
    phasesRef.current = phases;
    phaseIndexRef.current = phaseIndex;
    phaseStartedAtRef.current = phaseStartedAt;
  }, [phases, phaseIndex, phaseStartedAt]);

  // Clock de 1s: atualiza o relógio e, se a fase por tempo zerou, avança (o
  // setState fica no callback do timer, não no corpo do effect).
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

  if (!guided || !phase) {
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

  const totalElapsed = Math.floor((now - guided.startedAt) / 1000);
  const nextWork = phases.slice(phaseIndex + 1).find((entry) => entry.type === 'work');
  const progress = isTimed && targetSeconds > 0 ? Math.min(100, (phaseElapsed / targetSeconds) * 100) : 0;
  const effort = phase.step.target?.effort ?? 'moderate';
  const isRest = phase.type === 'rest';

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between px-4 pb-2 pt-safe-top">
        <button type="button" onClick={() => setExitOpen(true)} aria-label={t('meufit.training.guided.exit')} className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface active:bg-surface-container-high">
          <X size={22} aria-hidden />
        </button>
        <div className="text-center">
          <p className="font-sans text-label text-on-surface">{guided.title}</p>
          <p className="mt-0.5 font-sans text-counter tabular-nums text-on-surface-variant">{formatClock(totalElapsed)}</p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center font-sans text-counter tabular-nums text-on-surface-variant">{phase.workIndex + 1}/{totalWorkSteps}</span>
      </header>

      {/* Trilha de progresso dos passos */}
      <div className="flex gap-1 px-4">
        {Array.from({ length: totalWorkSteps }).map((_, index) => (
          <span key={index} className={clsx('h-1 flex-1 rounded-full', index < phase.workIndex ? 'bg-primary' : index === phase.workIndex ? 'bg-primary/50' : 'bg-surface-container-high')} />
        ))}
      </div>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <span className={clsx('font-sans text-label uppercase tracking-[0.14em]', isRest ? 'text-on-surface-variant' : 'text-primary')}>
          {isRest ? t('meufit.training.guided.rest') : t(ROLE_KEY[phase.step.role])}
          {phase.repeatLabel ? ` · ${phase.repeatLabel}` : ''}
        </span>

        {phase.step.label && !isRest ? (
          <h1 className="mt-3 text-balance font-sans text-title-lg text-on-surface">{phase.step.label}</h1>
        ) : null}

        {/* Cronômetro / medida do passo */}
        <p className="mt-6 font-sans text-display tabular-nums text-on-surface" style={{ fontSize: 'clamp(3rem, 18vw, 5rem)' }}>
          {isTimed ? formatClock(remaining) : phase.bound.by === 'reps' ? `${phase.bound.reps}` : formatClock(phaseElapsed)}
        </p>
        <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{boundLabel(phase.bound, t)}</p>

        {/* Alvo de esforço (número é opcional) */}
        {!isRest ? (
          <div className={clsx('mt-6 inline-flex items-center gap-2 rounded-full px-4 py-2 font-sans text-label', strongEffort(effort) ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface')}>
            {t(EFFORT_KEY[effort])}
            {targetSuffix(phase.step, t) ? <span className="font-sans text-counter opacity-80">{targetSuffix(phase.step, t)}</span> : null}
          </div>
        ) : null}

        {phase.step.note && !isRest ? <p className="mt-4 max-w-[22rem] font-sans text-body-sm text-on-surface-variant">{phase.step.note}</p> : null}

        {/* Barra da fase por tempo */}
        {isTimed ? (
          <div className="mt-8 h-1.5 w-full max-w-[22rem] overflow-hidden rounded-full bg-surface-container-high">
            <span className="block h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </main>

      {/* Próximo passo */}
      {nextWork ? (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-2xl bg-surface-container px-4 py-2.5">
          <ChevronRight size={16} className="shrink-0 text-on-surface-variant" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-sans text-body-sm text-on-surface-variant">
            <span className="text-on-surface">{t('meufit.training.guided.next')}:</span> {nextWork.step.label || t(ROLE_KEY[nextWork.step.role])} · {boundLabel(nextWork.bound, t)}
          </span>
        </div>
      ) : null}

      <footer className="shrink-0 px-4 pb-safe-bottom pt-2">
        <button
          type="button"
          onClick={advance}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-primary font-sans text-label text-on-primary transition-opacity duration-150 hover:opacity-90 active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {phaseIndex + 1 >= phases.length ? (
            <><Check size={18} aria-hidden />{t('meufit.training.guided.finish')}</>
          ) : isTimed ? (
            <><SkipForward size={18} aria-hidden />{t('meufit.training.guided.skip')}</>
          ) : (
            <><Check size={18} aria-hidden />{isRest ? t('meufit.training.guided.next') : t('meufit.training.guided.nextDone')}</>
          )}
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

function boundLabel(bound: StepBound, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string {
  if (bound.by === 'time') return t('meufit.training.guided.byTime');
  if (bound.by === 'distance') {
    return bound.meters >= 1000
      ? t('meufit.training.guided.byDistanceKm', { v: (Math.round((bound.meters / 1000) * 100) / 100).toLocaleString('pt-BR') })
      : t('meufit.training.guided.byDistanceM', { v: bound.meters });
  }
  if (bound.by === 'reps') return t('meufit.training.guided.byReps', { n: bound.reps });
  return t('meufit.training.guided.byOpen');
}

function targetSuffix(step: GuidedSingleStep, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string | null {
  const target = step.target;
  if (!target) return null;
  const parts: string[] = [];
  if (target.paceSecPerKm) parts.push(t('meufit.training.guided.targetPace', { pace: formatClock(target.paceSecPerKm) }));
  if (target.hrZone) parts.push(t('meufit.training.guided.targetHr', { zone: target.hrZone }));
  return parts.length ? `· ${parts.join(' · ')}` : null;
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
