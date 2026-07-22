import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  ListChecks,
  Minus,
  Pencil,
  Play,
  Plus,
  Shuffle,
  Timer,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useTraining, type ExerciseSetLog } from '@/features/training/TrainingProvider';
import { useLogWorkoutSession } from '@/features/training/useWorkoutSessions';
import { RestTimerBanner } from '@/features/training/components/RestTimerBanner';

type Sheet = 'exit' | 'list' | 'effort' | 'note' | 'video' | 'substitute' | null;
type Summary = { title: string; duration: string; sets: number; totalSets: number; volume: number; prs: number };

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export function TrainingPlayerPage() {
  const navigate = useNavigate();
  const training = useTraining();
  const logSession = useLogWorkoutSession();
  const [elapsed, setElapsed] = useState(0);
  const [rest, setRest] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const session = training.activeSession;
  const template = training.templates.find((item) => item.id === session?.templateId);

  useEffect(() => {
    if (!session) return;
    const timerId = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - session.startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [session]);

  useEffect(() => {
    if (!rest) return;
    const timerId = window.setInterval(() => {
      setRest((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [rest]);

  const totals = useMemo(() => {
    if (!session || !template) return { done: 0, total: 0, volume: 0 };
    const sets = Object.values(session.logs).flat();
    return {
      done: sets.filter((set) => set.completed).length,
      total: template.exercises.reduce((count, exercise) => count + exercise.sets, 0),
      volume: sets.reduce((sum, set) => sum + (set.completed ? set.weight * set.reps : 0), 0),
    };
  }, [session, template]);

  if (summary) {
    return <WorkoutSummary summary={summary} onClose={() => navigate('/meu-fit/treino')} />;
  }

  if (!session || !template) {
    return (
      <div className="flex h-full flex-col bg-background px-5 pb-safe-bottom pt-safe-top">
        <button
          type="button"
          onClick={() => navigate('/meu-fit/treino')}
          className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface"
          aria-label="Voltar"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Dumbbell className="text-primary" size={40} />
          <h1 className="mt-5 font-sans text-title-lg text-on-surface">Nenhum treino em execução</h1>
          <p className="mt-2 max-w-[18rem] font-sans text-body-sm text-on-surface-variant">
            Abra um treino programado pela agenda para iniciar o Player.
          </p>
        </div>
      </div>
    );
  }

  const exercise = template.exercises[session.activeExercise];
  const logs = session.logs[exercise.id];
  const nextOpenIndex = logs.findIndex((set) => !set.completed);
  const activeSetIndex = nextOpenIndex === -1 ? logs.length - 1 : nextOpenIndex;
  const activeSet = logs[activeSetIndex];
  const exerciseDone = logs.every((set) => set.completed);
  const isLastExercise = session.activeExercise === template.exercises.length - 1;
  const progress = totals.total > 0 ? (totals.done / totals.total) * 100 : 0;

  const updateSet = (values: Partial<ExerciseSetLog>) => {
    training.updateSet(exercise.id, activeSetIndex, values);
  };

  const completeSet = () => {
    if (activeSet.completed) return;
    training.toggleSet(exercise.id, activeSetIndex);
    setRest(90);
  };

  const goNextExercise = () => {
    if (!isLastExercise) {
      training.setActiveExercise(session.activeExercise + 1);
      setRest(0);
      return;
    }

    const finishedSets = Object.values(session.logs).flat().filter((set) => set.completed).length;
    setSummary({
      title: template.title,
      duration: formatTime(elapsed),
      sets: finishedSets,
      totalSets: totals.total,
      volume: totals.volume,
      prs: totals.volume > 0 ? 2 : 0,
    });
    // Persiste a conclusão (fonte de verdade do "feito hoje"). Só quando há um
    // workout real por trás; sessões avulsas ficam só no estado local.
    const scheduledItem = training.scheduled.find((entry) => entry.id === session.scheduledId);
    const exercisesDone = template.exercises.filter((ex) => (session.logs[ex.id] ?? []).some((set) => set.completed)).length;
    if (scheduledItem?.workoutId) {
      logSession.mutate({
        workoutId: scheduledItem.workoutId,
        assignmentId: scheduledItem.assignmentId ?? null,
        startedAt: new Date(session.startedAt).toISOString(),
        exercisesDone,
        exercisesTotal: template.exercises.length,
      });
    }
    training.completeSession();
  };

  const primaryLabel = exerciseDone ? (isLastExercise ? 'Concluir treino' : 'Próximo exercício') : 'Concluir série';
  const primaryAction = exerciseDone ? goNextExercise : completeSet;

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="border-b border-outline-variant/30 bg-surface-container-lowest/95 px-4 pb-3 pt-safe-top backdrop-blur-md">
        <div className="flex min-h-14 items-center justify-between">
          <button
            type="button"
            onClick={() => setSheet('exit')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface active:bg-surface-container-high"
            aria-label="Sair do treino"
          >
            <ArrowLeft size={22} />
          </button>

          <div className="min-w-0 text-center">
            <p className="truncate font-sans text-label text-on-surface">{template.title}</p>
            <p className="mt-0.5 font-sans text-counter text-on-surface-variant">
              {totals.done}/{totals.total} séries · {formatTime(elapsed)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSheet('list')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface active:bg-surface-container-high"
            aria-label="Lista de exercícios"
          >
            <ListChecks size={22} />
          </button>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-surface-container-high">
          <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <RestTimerBanner seconds={rest} onSkip={() => setRest(0)} />

      <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5">
        <section className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-sans text-counter text-primary">{exercise.muscle}</p>
            <h1 className="mt-1 text-balance font-sans text-display text-on-surface">{exercise.name}</h1>
            <p className="mt-2 font-sans text-body-sm text-on-surface-variant">{exercise.technique}</p>
          </div>
          <button
            type="button"
            onClick={() => setSheet('video')}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/40 bg-surface-container text-primary active:scale-[0.98]"
            aria-label="Ver demonstração"
          >
            <Play size={22} fill="currentColor" />
          </button>
        </section>

        <section className="mt-6 rounded-2xl border border-outline-variant/40 bg-surface-container-low p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-sans text-counter text-on-surface-variant">Série atual</p>
              <p className="mt-1 font-sans text-title-lg text-on-surface">
                {activeSetIndex + 1} de {logs.length}
              </p>
            </div>
            <div className="rounded-full bg-surface-container px-3 py-2 font-sans text-counter text-on-surface-variant">
              Meta {exercise.targetReps}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <MetricStepper
              label="Carga"
              value={activeSet.weight}
              suffix="kg"
              step={0.5}
              min={0}
              onChange={(value) => updateSet({ weight: value })}
            />
            <MetricStepper
              label="Reps"
              value={activeSet.reps}
              step={1}
              min={1}
              onChange={(value) => updateSet({ reps: value })}
            />
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-container px-3 py-3">
            <span className="font-sans text-body-sm text-on-surface-variant">
              No treino anterior: {exercise.lastWeight} kg · {exercise.lastReps} reps
            </span>
            {activeSet.completed ? (
              <span className="flex items-center gap-1 font-sans text-counter text-primary">
                <Check size={15} /> Feita
              </span>
            ) : null}
          </div>
        </section>

        <section className="mt-4 grid grid-cols-3 gap-2">
          <QuickAction label={activeSet.rpe ? `RPE ${activeSet.rpe}` : 'RPE'} onClick={() => setSheet('effort')} />
          <QuickAction label={activeSet.rir !== null ? `RIR ${activeSet.rir}` : 'RIR'} onClick={() => setSheet('effort')} />
          <QuickAction label="Nota" icon={<Pencil size={16} />} onClick={() => setSheet('note')} />
        </section>

        <button
          type="button"
          onClick={() => setSheet('substitute')}
          className="mt-3 flex min-h-12 w-full items-center justify-between rounded-xl border border-outline-variant/35 bg-surface-container px-4 text-left font-sans text-label text-on-surface active:bg-surface-container-high"
        >
          <span className="flex items-center gap-2">
            <Shuffle size={17} className="text-primary" />
            Substituir exercício
          </span>
          <ChevronRight size={18} className="text-on-surface-variant" />
        </button>

        <ExerciseDots logs={logs} activeIndex={activeSetIndex} />
      </main>

      <footer className="shrink-0 border-t border-outline-variant/30 bg-background px-4 pb-safe-bottom pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => training.setActiveExercise(Math.max(0, session.activeExercise - 1))}
            disabled={session.activeExercise === 0}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-outline-variant/35 text-on-surface disabled:opacity-40"
            aria-label="Exercício anterior"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            onClick={primaryAction}
            className="min-h-12 flex-1 rounded-xl bg-primary px-4 font-sans text-label text-on-primary active:scale-[0.99]"
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            onClick={() => training.setActiveExercise(Math.min(template.exercises.length - 1, session.activeExercise + 1))}
            disabled={isLastExercise}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-outline-variant/35 text-on-surface disabled:opacity-40"
            aria-label="Próximo exercício"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </footer>

      <ExitSheet open={sheet === 'exit'} onClose={() => setSheet(null)} onLeave={() => navigate('/meu-fit/treino')} />
      <ExerciseListSheet
        open={sheet === 'list'}
        onClose={() => setSheet(null)}
        current={session.activeExercise}
        exercises={template.exercises}
        logs={session.logs}
        onSelect={(index) => {
          training.setActiveExercise(index);
          setSheet(null);
        }}
      />
      <EffortSheet open={sheet === 'effort'} onClose={() => setSheet(null)} set={activeSet} onChange={updateSet} />
      <NoteSheet
        open={sheet === 'note'}
        note={session.note}
        onClose={() => setSheet(null)}
        onChange={training.updateSessionNote}
      />
      <VideoSheet
        open={sheet === 'video'}
        onClose={() => setSheet(null)}
        title={exercise.name}
        description={exercise.demoLabel}
        videoUrl={exercise.videoUrl}
      />
      <SubstituteSheet open={sheet === 'substitute'} onClose={() => setSheet(null)} />
    </div>
  );
}

function MetricStepper({
  label,
  value,
  suffix,
  step,
  min,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  step: number;
  min: number;
  onChange: (value: number) => void;
}) {
  const setValue = (next: number) => onChange(Math.max(min, next));

  return (
    <div className="rounded-2xl border border-outline-variant/35 bg-surface-container px-3 py-4 text-center">
      <p className="font-sans text-counter text-on-surface-variant">{label}</p>
      <label className="mt-2 flex items-baseline justify-center gap-1">
        <span className="sr-only">{label}</span>
        <input
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) setValue(next);
          }}
          className="w-24 bg-transparent text-center font-sans text-display text-on-surface outline-none ring-1 ring-transparent focus:rounded-lg focus:ring-primary"
        />
        {suffix ? <span className="align-middle font-sans text-label text-on-surface-variant">{suffix}</span> : null}
      </label>
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setValue(value - step)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-high text-on-surface"
          aria-label={`Diminuir ${label}`}
        >
          <Minus size={18} />
        </button>
        <button
          type="button"
          onClick={() => setValue(value + step)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary"
          aria-label={`Aumentar ${label}`}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

function QuickAction({ label, icon, onClick }: { label: string; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 items-center justify-center gap-1 rounded-xl border border-outline-variant/35 bg-surface-container font-sans text-counter text-on-surface active:bg-surface-container-high"
    >
      {icon}
      {label}
    </button>
  );
}

function ExerciseDots({ logs, activeIndex }: { logs: ExerciseSetLog[]; activeIndex: number }) {
  return (
    <div className="mt-5 flex items-center gap-2" aria-label="Progresso das séries">
      {logs.map((set, index) => (
        <span
          key={index}
          className={clsx(
            'h-2 rounded-full transition-all',
            index === activeIndex ? 'w-8 bg-primary' : 'w-2',
            set.completed && index !== activeIndex ? 'bg-primary/70' : 'bg-outline-variant',
          )}
        />
      ))}
    </div>
  );
}

function ExitSheet({ open, onClose, onLeave }: { open: boolean; onClose: () => void; onLeave: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Pausar treino" description="Seu progresso fica salvo enquanto o app estiver aberto.">
      <div className="px-5 pb-6">
        <button type="button" onClick={onClose} className="min-h-12 w-full rounded-xl bg-primary font-sans text-label text-on-primary">
          Continuar treinando
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="mt-3 min-h-12 w-full rounded-xl border border-outline-variant/40 font-sans text-label text-on-surface"
        >
          Salvar e sair
        </button>
      </div>
    </BottomSheet>
  );
}

function ExerciseListSheet({
  open,
  onClose,
  current,
  exercises,
  logs,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  current: number;
  exercises: { id: string; name: string; muscle: string; sets: number }[];
  logs: Record<string, ExerciseSetLog[]>;
  onSelect: (index: number) => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Treino" description="Exercícios prescritos pelo profissional.">
      <div className="space-y-2 px-5 pb-6">
        {exercises.map((exercise, index) => {
          const done = logs[exercise.id].filter((set) => set.completed).length;
          const selected = index === current;
          return (
            <button
              key={exercise.id}
              type="button"
              onClick={() => onSelect(index)}
              className={clsx(
                'flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 text-left',
                selected ? 'border-primary bg-primary-container text-on-primary-container' : 'border-outline-variant/35 bg-surface-container text-on-surface',
              )}
            >
              <span
                className={clsx(
                  'flex h-9 w-9 items-center justify-center rounded-full font-sans text-counter',
                  selected ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant',
                )}
              >
                {done === exercise.sets ? <Check size={16} /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-sans text-label">{exercise.name}</span>
                <span className="mt-0.5 block font-sans text-body-sm opacity-75">
                  {exercise.muscle} · {done}/{exercise.sets} séries
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}

function EffortSheet({
  open,
  onClose,
  set,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  set: ExerciseSetLog;
  onChange: (values: Partial<ExerciseSetLog>) => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Esforço" description="Opcional. Ajuda seu profissional a ajustar a próxima execução.">
      <div className="space-y-5 px-5 pb-6">
        <ChoiceGroup
          label="RPE"
          values={[6, 7, 8, 9, 10]}
          selected={set.rpe}
          onSelect={(value) => onChange({ rpe: value })}
        />
        <ChoiceGroup
          label="RIR"
          values={[0, 1, 2, 3, 4]}
          selected={set.rir}
          onSelect={(value) => onChange({ rir: value })}
        />
        <button type="button" onClick={onClose} className="min-h-12 w-full rounded-xl bg-primary font-sans text-label text-on-primary">
          Confirmar
        </button>
      </div>
    </BottomSheet>
  );
}

function ChoiceGroup({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: number[];
  selected: number | null;
  onSelect: (value: number) => void;
}) {
  return (
    <div>
      <p className="font-sans text-label text-on-surface">{label}</p>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onSelect(value)}
            className={clsx(
              'min-h-12 rounded-xl border font-sans text-label',
              selected === value ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant/40 bg-surface-container text-on-surface',
            )}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function NoteSheet({
  open,
  note,
  onClose,
  onChange,
}: {
  open: boolean;
  note: string;
  onClose: () => void;
  onChange: (note: string) => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Nota da sessão" description="Contexto curto para você e seu profissional.">
      <div className="px-5 pb-6">
        <textarea
          value={note}
          onChange={(event) => onChange(event.target.value)}
          rows={5}
          className="w-full resize-none rounded-xl border border-outline-variant/40 bg-surface-container px-4 py-3 font-sans text-body text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder="Ex.: senti o ombro no aquecimento."
        />
        <button type="button" onClick={onClose} className="mt-4 min-h-12 w-full rounded-xl bg-primary font-sans text-label text-on-primary">
          Salvar nota
        </button>
      </div>
    </BottomSheet>
  );
}

function VideoSheet({
  open,
  onClose,
  title,
  description,
  videoUrl,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  videoUrl?: string | null;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Demonstração" description={title}>
      <div className="px-5 pb-6">
        {videoUrl ? (
          <video
            src={videoUrl}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-2xl bg-black object-contain"
          />
        ) : (
          <div className="flex aspect-video flex-col items-center justify-center rounded-2xl border border-outline-variant/40 bg-surface-container px-5 text-center">
            <Play size={24} className="text-on-surface-variant" aria-hidden />
            <p className="mt-3 font-sans text-label text-on-surface">Demonstração ainda não publicada</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">Quando o profissional adicionar o vídeo deste exercício, ele aparecerá aqui.</p>
          </div>
        )}
        <p className="mt-4 font-sans text-body text-on-surface-variant">{description}</p>
      </div>
    </BottomSheet>
  );
}

function SubstituteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Substituir exercício" description="Nesta fase o app mostra o ponto de entrada. A regra final vem do profissional.">
      <div className="space-y-2 px-5 pb-6">
        {['Mesmo grupo muscular', 'Sem equipamento livre', 'Dor ou limitação'].map((reason) => (
          <button
            key={reason}
            type="button"
            onClick={onClose}
            className="flex min-h-13 w-full items-center justify-between rounded-xl border border-outline-variant/35 bg-surface-container px-4 text-left font-sans text-label text-on-surface"
          >
            {reason}
            <ChevronRight size={18} className="text-on-surface-variant" />
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

function WorkoutSummary({ summary, onClose }: { summary: Summary; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col bg-background px-5 pb-safe-bottom pt-safe-top">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface active:bg-surface-container-high"
          aria-label="Fechar resumo"
        >
          <X size={22} />
        </button>
      </div>
      <main className="flex flex-1 flex-col justify-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary text-on-primary">
          <Check size={34} />
        </div>
        <h1 className="mt-6 text-center font-sans text-display text-on-surface">{summary.title}</h1>
        <p className="mt-2 text-center font-sans text-body-sm text-on-surface-variant">Treino concluído</p>
        <div className="mt-8 grid grid-cols-2 gap-3">
          <SummaryMetric icon={<Timer size={18} />} value={summary.duration} label="duração" />
          <SummaryMetric value={`${summary.sets}/${summary.totalSets}`} label="séries" />
          <SummaryMetric value={`${Math.round(summary.volume).toLocaleString('pt-BR')} kg`} label="volume" />
          <SummaryMetric value={`${summary.prs}`} label="PRs simulados" />
        </div>
      </main>
      <button type="button" onClick={onClose} className="min-h-12 rounded-xl bg-primary font-sans text-label text-on-primary">
        Voltar para Agenda
      </button>
    </div>
  );
}

function SummaryMetric({ icon, value, label }: { icon?: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant/35 bg-surface-container p-4">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <p className="font-sans text-title text-on-surface">{value}</p>
      </div>
      <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{label}</p>
    </div>
  );
}
