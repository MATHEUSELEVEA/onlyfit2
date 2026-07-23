import { useMemo, useState, type ReactNode } from 'react';
import { Activity, Bike, Check, ChevronDown, ChevronLeft, ChevronRight, Droplet, Dumbbell, Flame, Footprints, Gauge, HeartPulse, Info, Layers, Leaf, MapPin, Moon, Play, Plus, RotateCcw, ShoppingBag, Sparkles, Timer, User, Waves, Watch, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { ActivityRing, MetricStat } from '@/components/health/HealthVisuals';
import { type ActivitySource, type ImportedActivity, type ScheduledWorkout, type TrainingStatus, type TrainingSurface, type WorkoutTemplate, useTraining } from '@/features/training/TrainingProvider';
import { useStudentWorkouts, type StudentWorkout } from '@/features/training/useStudentWorkouts';
import { useTodayWorkoutSessions, type TodayWorkoutSession } from '@/features/training/useWorkoutSessions';
import { useTrainingLibrary, type LibraryProtocol, type LibraryWorkout } from '@/features/training/useTrainingLibrary';
import { estimateDurationSeconds, flattenSteps, toGuidedWorkout } from '@/features/training/guidedSession';
import { useAppleHealth } from '@/features/wearables/useAppleHealth';
import { buildHealthDays, formatSleep, type HealthDay } from '@/features/wearables/healthDays';
import { activityMetaLine, activityMetrics, activitySportDetails, paceMinPerKm, PACE_SURFACES } from '@/features/wearables/sportActivityMetrics';
import { localDateKey, todayKey } from '@/lib/localDate';
import { useTranslation, type TranslationKey } from '@/i18n/I18nProvider';

type Tab = 'today' | 'history' | 'progress' | 'library';
type AppleHealthState = ReturnType<typeof useAppleHealth>;
const dateKey = (date: Date) => localDateKey(date);
const today = () => todayKey();
const MOVE_GOAL_KCAL = 500;

const statusLabel: Record<TrainingStatus, string> = { planned: 'Planejado', active: 'Em andamento', partial: 'Parcial', completed: 'Concluído', missed: 'Não realizado', imported: 'Importado', rest: 'Descanso' };
const statusTone: Record<TrainingStatus, string> = { planned: 'bg-outline', active: 'bg-primary', partial: 'bg-secondary', completed: 'bg-primary', missed: 'bg-error', imported: 'bg-tertiary', rest: 'bg-outline-variant' };
const sourceLabel = (source: string) => ({ healthkit: 'Apple Health', apple_health: 'Apple Health', garmin: 'Garmin', strava: 'Strava', coros: 'COROS', fitbit: 'Fitbit', manual: 'Registro pessoal', onlyfit: 'OnlyFit' }[source] ?? source);
const enduranceSurfaces: TrainingSurface[] = ['running', 'cycling', 'walking', 'swimming'];
const surfaceIcon: Record<TrainingSurface, ReactNode> = {
  strength: <Dumbbell size={18} />,
  running: <Activity size={18} />,
  cycling: <Bike size={18} />,
  walking: <Footprints size={18} />,
  swimming: <Waves size={18} />,
  functional: <Flame size={18} />,
  hiit: <Flame size={18} />,
  yoga: <Leaf size={18} />,
  pilates: <HeartPulse size={18} />,
  other: <Plus size={18} />,
};
const surfaceTranslationKey: Record<TrainingSurface, TranslationKey> = {
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

const weekdayFull = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' });
const historyDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

// Linha compacta da atividade = métrica-mãe do esporte (config única em
// sportActivityMetrics). Ex.: corrida → "32 min · 5,2 km · 5:30 /km".
function formatActivityMeta(activity: ImportedActivity) {
  return activityMetaLine(activity);
}

function formatActivityDateTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatActivitySource(activity: ImportedActivity) {
  const source = activitySourceLabel(activity);
  const device = typeof activity.sourcePayload?.device_name === 'string' ? activity.sourcePayload.device_name : null;
  return device ? `${source} · ${device}` : source;
}

// Intensidade (0..1) → nível de preenchimento do heatmap. Passos discretos em
// opacidade da cor de marca; premium por contenção, sem cor cheia em dia fraco.
function heatClass(day: HealthDay | undefined, selected: boolean): string {
  if (selected) return 'bg-primary text-on-primary';
  const intensity = day?.intensity ?? 0;
  if (!day?.hasData || intensity <= 0) return 'bg-surface-container-high text-on-surface-variant';
  if (intensity < 0.25) return 'bg-primary/15 text-on-surface';
  if (intensity < 0.5) return 'bg-primary/30 text-on-surface';
  if (intensity < 0.75) return 'bg-primary/55 text-on-surface';
  return 'bg-primary/85 text-on-primary';
}

function sourceText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
// Fonte da atividade como texto ("Apple Watch", "Strava"…) — entra no meta com "·",
// hierarquia por tipografia em vez de badge (padrão premium do Market).
function activitySourceLabel(activity: ImportedActivity): string {
  const payload = activity.sourcePayload ?? {};
  const raw = [
    sourceText(payload.source_name),
    sourceText(payload.bundle_identifier),
    sourceText(payload.device_name),
    sourceText(activity.provider),
    sourceText(activity.source),
  ].filter(Boolean).join(' ').toLowerCase();

  if (/nike|nrc|run club/.test(raw)) return 'Nike Run';
  if (/strava/.test(raw)) return 'Strava';
  if (/garmin/.test(raw)) return 'Garmin';
  if (/coros/.test(raw)) return 'COROS';
  if (/fitbit/.test(raw)) return 'Fitbit';
  if (activity.source === 'manual') return 'Manual';
  if (activity.importedFromWatch || /watch/.test(raw)) return 'Apple Watch';
  if (/apple|health|healthkit|saúde|saude/.test(raw)) return 'Apple Saúde';
  return sourceLabel(activity.source);
}

export function TrainingPage() { return <TrainingContent />; }

function TrainingContent() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('today');
  const [selectedDate, setSelectedDate] = useState(today());
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [detailActivity, setDetailActivity] = useState<ImportedActivity | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const { scheduled, imported, activeSession, addActivity } = useTraining();
  const appleHealth = useAppleHealth();
  const allImported = useMemo<ImportedActivity[]>(() => [...appleHealth.importedActivities, ...imported], [appleHealth.importedActivities, imported]);
  const healthDays = useMemo(() => buildHealthDays(appleHealth.importedActivities, appleHealth.dailySummaries), [appleHealth.importedActivities, appleHealth.dailySummaries]);
  const todayItems = scheduled.filter((item) => item.date === today());
  const activeItem = activeSession ? todayItems.find((item) => item.id === activeSession.scheduledId) : null;

  return <div className="relative flex h-full flex-col overflow-y-auto bg-background pb-8">
    <PageTopBar title={t('meufit.training.pageTitle')} backFallback="/meu-fit" />
    <main className="mx-auto w-full max-w-[720px] px-5 pb-6 pt-5">
      <div className="grid grid-cols-4 border-b border-outline-variant/30" role="tablist" aria-label={t('meufit.training.tabs.aria')}>{([['today', t('meufit.training.tabs.today')], ['history', t('meufit.training.tabs.history')], ['progress', t('meufit.training.tabs.progress')], ['library', t('meufit.training.tabs.library')]] as [Tab, string][]).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={clsx('relative flex min-h-[44px] items-center justify-center font-sans text-label transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', tab === value ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface active:text-on-surface')}>{label}{tab === value ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" aria-hidden /> : null}</button>)}</div>
      {tab === 'history' ? <AppleHealthCard appleHealth={appleHealth} compact /> : null}
      {tab === 'today' && <Today items={todayItems} active={activeItem ?? null} />}
      {tab === 'history' && <HistoryList imported={allImported} onOpenDay={(value) => setDetailDate(value)} onOpenActivity={setDetailActivity} onRecord={() => setRecordOpen(true)} />}
      {tab === 'progress' && <Progress appleHealth={appleHealth} healthDays={healthDays} scheduled={scheduled} selectedDate={selectedDate} onSelect={(value) => { setSelectedDate(value); setDetailDate(value); }} />}
      {tab === 'library' && <Library />}
    </main>
    <DayDetailSheet date={detailDate} onClose={() => setDetailDate(null)} healthDays={healthDays} scheduled={scheduled} onOpenActivity={setDetailActivity} />
    <ImportedActivitySheet activity={detailActivity} onClose={() => setDetailActivity(null)} />
    <AddActivitySheet open={recordOpen} onClose={() => setRecordOpen(false)} selectedDate={today()} onAdd={(activity) => { addActivity(activity); setRecordOpen(false); }} />
  </div>;
}

function Today({ items, active }: { items: ScheduledWorkout[]; active: ScheduledWorkout | null }) {
  const { t } = useTranslation();
  const { byWorkoutId } = useTodayWorkoutSessions();
  const { workouts: studentWorkouts } = useStudentWorkouts();
  const byAssignment = useMemo(() => new Map(studentWorkouts.map((workout) => [workout.assignmentId, workout])), [studentWorkouts]);
  const workouts = items.filter((item) => item.status !== 'rest' && item.status !== 'missed');
  const types = Array.from(new Set(workouts.map((item) => item.surface)));
  const sessionFor = (item: ScheduledWorkout) => (item.workoutId ? byWorkoutId.get(item.workoutId) ?? null : null);
  const isDone = (item: ScheduledWorkout) => Boolean(sessionFor(item)) || item.status === 'completed';
  // One Voice Rule: só o primeiro treino pendente (na ordem da tela) ganha o CTA primário.
  const firstPendingId = types.flatMap((surface) => workouts.filter((item) => item.surface === surface)).find((item) => !isDone(item))?.id ?? null;

  return (
    <section className="mt-6">
      <h2 className="font-sans text-title-lg text-on-surface">{t('meufit.training.today.heading')}</h2>
      {types.length ? (
        <div className="mt-6 space-y-9">
          {types.map((surface) => {
            const surfaceWorkouts = workouts.filter((item) => item.surface === surface);
            const doneCount = surfaceWorkouts.filter(isDone).length;
            return (
              <div key={surface}>
                {/* Cabeçalho da categoria: nomeia o grupo (ex.: Força) e mostra o
                    progresso do dia. Sem botão de "entrar" — os treinos vêm logo abaixo. */}
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0 text-on-surface-variant" aria-hidden>{surfaceIcon[surface]}</span>
                  <h3 className="min-w-0 flex-1 font-sans text-title text-on-surface">{t(surfaceTranslationKey[surface])}</h3>
                  <span className="shrink-0 font-sans text-counter tabular-nums text-on-surface-variant">{t('meufit.training.today.doneOf', { done: doneCount, total: surfaceWorkouts.length })}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {surfaceWorkouts.map((item) => <TodayWorkoutCard key={item.id} item={item} session={sessionFor(item)} isActive={active?.id === item.id} isPrimary={item.id === firstPendingId} studentWorkout={item.assignmentId ? byAssignment.get(item.assignmentId) : undefined} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-outline-variant/40 px-4 py-6">
          <p className="font-sans text-label text-on-surface">{t('meufit.training.today.emptyTitle')}</p>
          <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.today.emptyDescription')}</p>
        </div>
      )}
    </section>
  );
}

/**
 * Card de treino do dia — acionável direto, sem drill-in. Dois estados:
 * · a fazer  → uma linha de contexto (duração · nº de exercícios) e "Iniciar".
 * · concluído → selo verde, os dados reais da sessão (duração · exercícios · kcal)
 *   e "Refazer". Exercícios ficam recolhidos por padrão (toque para ver).
 * Acabamento premium por contenção: profundidade tonal, lime como única cor de ação.
 */
function TodayWorkoutCard({ item, session, isActive, isPrimary, studentWorkout }: { item: ScheduledWorkout; session: TodayWorkoutSession | null; isActive: boolean; isPrimary: boolean; studentWorkout?: StudentWorkout }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { templates, startSession, startGuided, activeSession } = useTraining();
  const [expanded, setExpanded] = useState(false);
  const template = templates.find((entry) => entry.id === item.templateId);
  // Esportes não-musculação executam pelo player guiado (deriva os passos do treino).
  const guidedPlan = useMemo(() => (studentWorkout && item.surface !== 'strength' ? toGuidedWorkout(studentWorkout) : null), [studentWorkout, item.surface]);
  const exerciseCount = guidedPlan ? flattenSteps(guidedPlan.steps).length : template?.exercises.length ?? 0;
  // Exercícios para a prévia expansível — mesma fonte da Biblioteca
  // (playerTemplate do treino prescrito), com fallback ao template local.
  const previewExercises = studentWorkout ? playerTemplate(studentWorkout).exercises : template?.exercises ?? [];
  const displayMinutes = guidedPlan ? Math.round(estimateDurationSeconds(guidedPlan.steps) / 60) : item.durationMin;
  const running = isActive || activeSession?.scheduledId === item.id || item.status === 'active';
  const done = Boolean(session) || item.status === 'completed';
  const canStart = guidedPlan ? true : item.canStart !== false && exerciseCount > 0;
  const open = () => {
    if (guidedPlan) {
      startGuided({ scheduledId: item.id, workoutId: item.workoutId ?? null, assignmentId: item.assignmentId, title: item.title, surface: item.surface, plan: guidedPlan });
      navigate('/meu-fit/treino/player/guiado');
      return;
    }
    startSession(item.id);
    navigate('/meu-fit/treino/player');
  };

  const doneMeta = session
    ? [
        session.durationMin ? t('meufit.training.today.minutes', { minutes: session.durationMin }) : null,
        session.exercisesDone != null && session.exercisesTotal != null ? t('meufit.training.today.exercisesDoneOf', { done: session.exercisesDone, total: session.exercisesTotal }) : null,
        session.calories ? `${session.calories} ${t('meufit.training.metric.kcal')}` : null,
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <article className={clsx('overflow-hidden rounded-2xl border bg-surface-container transition-colors', running && !done ? 'border-primary/40 bg-primary/[0.05]' : 'border-outline-variant/40')}>
      <div className="flex items-start gap-3 p-4">
        {previewExercises.length ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={t(expanded ? 'meufit.training.hideExercises' : 'meufit.training.showExercises')}
            className="-ml-1 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-on-surface-variant/30 transition-colors duration-150 hover:text-on-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronDown size={16} className={clsx('transition-transform duration-200', expanded ? 'rotate-180' : 'rotate-0')} aria-hidden />
          </button>
        ) : null}
        <span className={clsx('mt-0.5 shrink-0', done ? 'text-primary' : 'text-on-surface-variant')} aria-hidden>
          {done ? <Check size={18} /> : surfaceIcon[item.surface]}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="font-sans text-label leading-snug text-on-surface">{item.title}</h4>
          <p className="mt-1 font-sans text-body-sm tabular-nums text-on-surface-variant">
            {done
              ? [t('meufit.training.today.doneToday'), doneMeta].filter(Boolean).join(' · ')
              : [
                  displayMinutes ? t('meufit.training.today.minutes', { minutes: displayMinutes }) : null,
                  exerciseCount
                    ? t(
                        guidedPlan
                          ? (exerciseCount === 1 ? 'meufit.training.guided.stepCount' : 'meufit.training.guided.stepCountPlural')
                          : (exerciseCount === 1 ? 'meufit.training.library.exerciseCount' : 'meufit.training.library.exerciseCountPlural'),
                        { count: exerciseCount },
                      )
                    : null,
                ].filter(Boolean).join(' · ') || item.focus}
          </p>
        </div>
      </div>

      {expanded && previewExercises.length ? <WorkoutExercisePreview exercises={previewExercises} emptyLabel={t('meufit.training.today.noExercises')} /> : null}

      {done ? (
        <div className="p-3 pt-1">
          <button type="button" onClick={open} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-surface-container-high font-sans text-label text-on-surface transition-colors duration-150 hover:bg-surface-container-highest active:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <RotateCcw size={17} aria-hidden />
            {t('meufit.training.today.redo')}
          </button>
        </div>
      ) : canStart ? (
        <div className="p-3 pt-1">
          <button type="button" onClick={open} className={clsx('flex min-h-12 w-full items-center justify-center gap-2 rounded-xl font-sans text-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', isPrimary || running ? 'bg-primary text-on-primary transition-opacity duration-150 hover:opacity-90 active:opacity-80 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container' : 'bg-surface-container-high text-on-surface transition-colors duration-150 hover:bg-surface-container-highest active:bg-surface-container-highest')}>
            <Play size={18} fill="currentColor" aria-hidden />
            {t(running ? 'meufit.training.today.continue' : 'meufit.training.today.start')}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function WorkoutExercisePreview({ exercises, emptyLabel }: { exercises: WorkoutTemplate['exercises']; emptyLabel: string }) {
  if (!exercises.length) {
    return <p className="border-y border-outline-variant/20 bg-surface-container-lowest px-5 py-4 font-sans text-body-sm text-on-surface-variant">{emptyLabel}</p>;
  }

  return (
    <ol className="divide-y divide-outline-variant/15 border-y border-outline-variant/20 bg-surface-container-lowest">
      {exercises.map((exercise, index) => (
        <li key={exercise.id} className="flex items-center gap-3.5 px-5 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-surface-container-high font-sans text-counter tabular-nums text-on-surface">{String(index + 1).padStart(2, '0')}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-sans text-label text-on-surface">{exercise.name}</span>
            <span className="mt-0.5 block font-sans text-body-sm tabular-nums text-on-surface-variant">{exercise.muscle} · {exercise.sets} × {exercise.targetReps}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Conteúdo do dia: anel de energia, métricas, atividades e treinos, usado nos detalhes do Histórico e Progresso. */
function DayDetailContent({ date, healthDays, scheduled, showScheduled = true, onOpenActivity }: { date: string; healthDays: Map<string, HealthDay>; scheduled: ScheduledWorkout[]; showScheduled?: boolean; onOpenActivity?: (activity: ImportedActivity) => void }) {
  const navigate = useNavigate();
  const { startSession, startGuided, reschedule } = useTraining();
  const { workouts: studentWorkouts } = useStudentWorkouts();
  const byAssignment = useMemo(() => new Map(studentWorkouts.map((workout) => [workout.assignmentId, workout])), [studentWorkouts]);
  const launchScheduled = (item: ScheduledWorkout) => {
    const workout = item.assignmentId ? byAssignment.get(item.assignmentId) : undefined;
    const guidedPlan = workout ? toGuidedWorkout(workout) : null;
    if (workout && guidedPlan) {
      startGuided({ scheduledId: item.id, workoutId: item.workoutId ?? null, assignmentId: item.assignmentId, title: item.title, surface: item.surface, plan: guidedPlan });
      navigate('/meu-fit/treino/player/guiado');
      return;
    }
    startSession(item.id);
    navigate('/meu-fit/treino/player');
  };
  const day = healthDays.get(date);
  const dayScheduled = showScheduled ? scheduled.filter((item) => item.date === date) : [];
  const metrics = useMemo(() => {
    if (!day) return [] as { value: string; label: string; icon: ReactNode }[];
    const list: { value: string; label: string; icon: ReactNode }[] = [];
    if (day.steps) list.push({ value: day.steps.toLocaleString('pt-BR'), label: 'passos', icon: <Footprints size={14} aria-hidden /> });
    if (day.activeKcal) list.push({ value: `${Math.round(day.activeKcal)}`, label: 'kcal ativas', icon: <Flame size={14} aria-hidden /> });
    if (day.restingHr) list.push({ value: `${day.restingHr}`, label: 'FC repouso', icon: <HeartPulse size={14} aria-hidden /> });
    if (day.hrv) list.push({ value: `${Math.round(day.hrv)}`, label: 'HRV ms', icon: <Activity size={14} aria-hidden /> });
    if (day.distanceM) list.push({ value: `${(Math.round((day.distanceM / 1000) * 10) / 10).toLocaleString('pt-BR')} km`, label: 'distância', icon: <MapPin size={14} aria-hidden /> });
    if (day.exerciseMinutes) list.push({ value: `${day.exerciseMinutes} min`, label: 'exercício', icon: <Timer size={14} aria-hidden /> });
    if (day.vo2max) list.push({ value: `${day.vo2max}`, label: 'VO₂max', icon: <Gauge size={14} aria-hidden /> });
    const sleep = formatSleep(day.sleepMinutes);
    if (sleep) list.push({ value: sleep, label: 'sono', icon: <Moon size={14} aria-hidden /> });
    return list;
  }, [day]);

  const hasAnything = (day?.hasData ?? false) || dayScheduled.length > 0;
  if (!hasAnything) {
    return <p className="rounded-2xl border border-dashed border-outline-variant/40 px-4 py-5 font-sans text-body-sm text-on-surface-variant">Dia livre. Sem treinos programados nem atividades registradas.</p>;
  }

  const ringProgress = day?.activeKcal ? Math.min(1, day.activeKcal / MOVE_GOAL_KCAL) : (day?.activities.length ? 0.5 : 0);

  return (
    <div className="space-y-3">
      {day?.hasData ? (
        <div className="rounded-2xl border border-outline-variant/40 bg-surface-container p-4">
          <div className="flex items-center gap-4">
            <ActivityRing progress={ringProgress} size={60} stroke={5}>
              <span className="flex flex-col items-center leading-none">
                <span className="font-sans text-label tabular-nums text-on-surface">{day.activeKcal ? Math.round(day.activeKcal) : day.activities.length}</span>
                <span className="font-sans text-nav text-on-surface-variant">{day.activeKcal ? 'kcal' : 'ativ.'}</span>
              </span>
            </ActivityRing>
            <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3">
              {metrics.slice(0, 4).map((metric) => <MetricStat key={metric.label} value={metric.value} label={metric.label} icon={metric.icon} />)}
            </div>
          </div>
          {metrics.length > 4 ? (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-outline-variant/30 pt-3">
              {metrics.slice(4).map((metric) => (
                <span key={metric.label} className="inline-flex items-center gap-1.5 font-sans text-body-sm text-on-surface-variant">
                  <span className="text-on-surface-variant">{metric.icon}</span>
                  <span className="font-sans text-label tabular-nums text-on-surface">{metric.value}</span> {metric.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {dayScheduled.map((item) => (
        <div key={item.id} className="flex items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface-container p-3">
          <TrainingBadge surface={item.surface} status={item.status} />
          <div className="min-w-0 flex-1">
            <p className="font-sans text-label text-on-surface">{item.title}</p>
            <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{statusLabel[item.status]} · {item.summary ?? `${item.durationMin} min`}</p>
          </div>
          {item.status === 'planned' && item.canStart !== false ? <button type="button" onClick={() => launchScheduled(item)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary" aria-label={`Começar ${item.title}`}><Play size={16} fill="currentColor" aria-hidden /></button> : null}
          {item.status === 'missed' ? <button type="button" onClick={() => reschedule(item.id)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-primary" aria-label={`Reagendar ${item.title}`}><RotateCcw size={16} aria-hidden /></button> : null}
        </div>
      ))}

      {(day?.activities ?? []).map((activity) => (
        <button key={activity.id} type="button" onClick={() => onOpenActivity?.(activity)} className="flex w-full items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface p-3 text-left transition-colors duration-150 hover:bg-surface-container-high active:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <TrainingBadge surface={activity.surface} status="imported" />
          <div className="min-w-0 flex-1">
            <p className="font-sans text-label text-on-surface">{activity.title}</p>
            <p className="mt-0.5 break-words font-sans text-body-sm text-on-surface-variant">{`${formatActivityMeta(activity)} · ${activitySourceLabel(activity)}`}</p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-on-surface-variant" aria-hidden />
        </button>
      ))}
    </div>
  );
}

function DayDetailSheet({ date, onClose, healthDays, scheduled, onOpenActivity }: { date: string | null; onClose: () => void; healthDays: Map<string, HealthDay>; scheduled: ScheduledWorkout[]; onOpenActivity: (activity: ImportedActivity) => void }) {
  return (
    <BottomSheet open={!!date} onClose={onClose} title={date ? weekdayFull(date) : ''} description={date ? new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined} panelClassName="max-h-[88%]">
      <div className="px-5 pb-8 pt-1">{date ? <DayDetailContent date={date} healthDays={healthDays} scheduled={scheduled} onOpenActivity={onOpenActivity} /> : null}</div>
    </BottomSheet>
  );
}

function ActivityDetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <div className="flex items-center justify-between gap-4 border-b border-outline-variant/25 py-3 last:border-b-0"><span className="font-sans text-body-sm text-on-surface-variant">{label}</span><span className="text-right font-sans text-body-sm font-semibold text-on-surface">{value}</span></div>;
}

function ImportedActivitySheet({ activity, onClose }: { activity: ImportedActivity | null; onClose: () => void }) {
  const { t } = useTranslation();
  if (!activity) return null;
  const sourcePayload = activity.sourcePayload ?? {};
  const deviceName = typeof sourcePayload.device_name === 'string' ? sourcePayload.device_name : null;
  const sourceName = typeof sourcePayload.source_name === 'string' ? sourcePayload.source_name : null;
  const appVersion = typeof sourcePayload.app_version === 'string' ? sourcePayload.app_version : null;
  const startedAt = formatActivityDateTime(activity.startedAt);
  const endedAt = formatActivityDateTime(activity.endedAt);
  const source = formatActivitySource(activity);
  const speed = activity.averageSpeedKmh ? `${activity.averageSpeedKmh.toLocaleString('pt-BR')} km/h` : null;
  const distance = activity.distanceKm ? `${activity.distanceKm.toLocaleString('pt-BR')} km` : null;
  const pace = paceMinPerKm(activity.distanceKm, activity.movingTimeMin ?? activity.durationMin);
  const paceLabel = pace ? `${pace} /km` : null;
  // Resumo (hero) e detalhes sport-specific vêm da config por esporte: cada
  // modalidade destaca a SUA métrica-mãe no topo.
  const { hero, more } = activityMetrics(activity);
  const summary = [...hero, ...more].slice(0, 4);
  const sportDetails = activitySportDetails(activity);
  const details: Array<[string, string | null]> = [
    ['Tempo total', activity.durationMin ? `${activity.durationMin} min` : null],
    ['Tempo em movimento', activity.movingTimeMin ? `${activity.movingTimeMin} min` : null],
    ['Distância', distance],
    ['Ritmo', PACE_SURFACES.includes(activity.surface) ? paceLabel : null],
    ['Velocidade média', speed],
    ...sportDetails.map((metric): [string, string | null] => [t(metric.labelKey), metric.value]),
    ['Calorias', activity.calories ? `${activity.calories} kcal` : null],
    ['FC média', activity.averageHeartRate ? `${activity.averageHeartRate} bpm` : null],
    ['FC máxima', activity.maxHeartRate ? `${activity.maxHeartRate} bpm` : null],
    ['Elevação acumulada', activity.elevationM ? `${activity.elevationM} m` : null],
    ['Potência média', activity.averagePowerW ? `${activity.averagePowerW} W` : null],
    ['Potência ponderada', activity.weightedPowerW ? `${activity.weightedPowerW} W` : null],
    ['Carga de treino', activity.trainingLoad ? `${activity.trainingLoad}` : null],
    ['RPE', activity.rpe ? `${activity.rpe}/10` : null],
  ];

  return (
    <BottomSheet open onClose={onClose} title={activity.title} description={[startedAt, source].filter(Boolean).join(' · ')} panelClassName="max-h-[92%]">
      <div className="space-y-5 px-5 pb-8 pt-2">
        <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
          <TrainingBadge surface={activity.surface} status="imported" />
          <div className="min-w-0 flex-1">
            <p className="font-sans text-label text-on-surface">Registro importado</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">Dados preservados da integração, organizados por modalidade.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar detalhes" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant"><X size={17} aria-hidden /></button>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2"><Info size={15} className="text-primary" aria-hidden /><h3 className="font-sans text-counter font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Resumo</h3></div>
          <div className="grid grid-cols-2 gap-2">
            {summary.map((metric) => <div key={metric.labelKey} className="rounded-xl border border-outline-variant/30 bg-surface-container p-3"><p className="font-sans text-counter text-on-surface-variant">{t(metric.labelKey)}</p><p className="mt-1 font-sans text-label tabular-nums text-on-surface">{metric.value}</p></div>)}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2"><MapPin size={15} className="text-primary" aria-hidden /><h3 className="font-sans text-counter font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Dados da atividade</h3></div>
          <div className="rounded-xl border border-outline-variant/30 bg-surface-container px-4"><ActivityDetailRow label="Início" value={startedAt} /><ActivityDetailRow label="Fim" value={endedAt} />{details.map(([label, value]) => <ActivityDetailRow key={label} label={label} value={value} />)}</div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2"><Watch size={15} className="text-primary" aria-hidden /><h3 className="font-sans text-counter font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Origem</h3></div>
          <div className="rounded-xl border border-outline-variant/30 bg-surface-container px-4"><ActivityDetailRow label="Fonte" value={source} /><ActivityDetailRow label="Dispositivo" value={deviceName} /><ActivityDetailRow label="Nome da origem" value={sourceName} /><ActivityDetailRow label="Versão da integração" value={appVersion} /><ActivityDetailRow label="ID externo" value={activity.externalId} /></div>
        </div>
      </div>
    </BottomSheet>
  );
}

/**
 * Progresso: o retrato dos últimos 30 dias + o calendário de consistência. É o
 * "big picture" (o quão constante estou, tendências). O Histórico é o oposto: o
 * registro item a item. Papéis distintos, sem redundância.
 */
function Progress({ appleHealth, healthDays, scheduled, selectedDate, onSelect }: { appleHealth: AppleHealthState; healthDays: Map<string, HealthDay>; scheduled: ScheduledWorkout[]; selectedDate: string; onSelect: (value: string) => void }) {
  const { t } = useTranslation();
  const completed = scheduled.filter((item) => item.status === 'completed').length;
  const p = appleHealth.progress;
  const primary = [
    { value: `${completed}`, label: t('meufit.training.progress.completed'), icon: <Sparkles size={14} aria-hidden />, emphasis: true },
    { value: p.activeKcal ? Math.round(p.activeKcal).toLocaleString('pt-BR') : '—', label: t('meufit.training.metric.kcal'), icon: <Flame size={14} aria-hidden />, emphasis: false },
    { value: p.steps ? p.steps.toLocaleString('pt-BR') : '—', label: t('meufit.training.metric.steps'), icon: <Footprints size={14} aria-hidden />, emphasis: false },
    { value: formatSleep(p.avgSleepMinutes) ?? '—', label: t('meufit.training.metric.sleep'), icon: <Moon size={14} aria-hidden />, emphasis: false },
  ];
  const secondary = [
    p.avgRestingHr ? { icon: <HeartPulse size={14} aria-hidden />, value: `${p.avgRestingHr}`, label: t('meufit.training.metric.restingHr') } : null,
    p.avgHrv ? { icon: <Activity size={14} aria-hidden />, value: `${p.avgHrv}`, label: t('meufit.training.metric.hrv') } : null,
    p.latestVo2max ? { icon: <Gauge size={14} aria-hidden />, value: `${p.latestVo2max}`, label: t('meufit.training.metric.vo2max') } : null,
    p.exerciseMinutes ? { icon: <Timer size={14} aria-hidden />, value: `${p.exerciseMinutes}`, label: t('meufit.training.metric.exercise') } : null,
    p.distanceKm ? { icon: <MapPin size={14} aria-hidden />, value: p.distanceKm.toLocaleString('pt-BR'), label: t('meufit.training.metric.distance') } : null,
    p.avgSpo2 ? { icon: <Droplet size={14} aria-hidden />, value: `${p.avgSpo2}%`, label: t('meufit.training.metric.spo2') } : null,
  ].filter(Boolean) as { icon: ReactNode; value: string; label: string }[];

  return (
    <section className="mt-6 space-y-6">
      <div>
        <h2 className="font-sans text-title-lg text-on-surface">{t('meufit.training.tabs.progress')}</h2>
        <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.progress.subtitle')}</p>
      </div>

      <div className="rounded-2xl border border-outline-variant/40 bg-surface-container p-5">
        <span className="font-sans text-counter text-on-surface-variant">{t('meufit.training.progress.last30')}</span>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
          {primary.map((metric) => <MetricStat key={metric.label} value={metric.value} label={metric.label} icon={metric.icon} emphasis={metric.emphasis} />)}
        </div>
        {secondary.length ? (
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 border-t border-outline-variant/30 pt-4">
            {secondary.map((metric) => (
              <span key={metric.label} className="inline-flex items-center gap-1.5">
                <span className="text-on-surface-variant">{metric.icon}</span>
                <span className="font-sans text-label tabular-nums text-on-surface">{metric.value}</span>
                <span className="font-sans text-counter text-on-surface-variant">{metric.label}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <Heatmap selectedDate={selectedDate} healthDays={healthDays} scheduled={scheduled} onSelect={onSelect} />
    </section>
  );
}

function playerTemplate(workout: StudentWorkout): WorkoutTemplate {
  const exercises = workout.exercises.map((exercise, index) => {
    const name = exercise.studentDisplayName || exercise.exerciseName || `Exercício ${index + 1}`;
    return {
      id: exercise.id,
      name,
      muscle: exercise.muscleGroup || 'Exercício',
      sets: exercise.sets,
      targetReps: exercise.reps,
      lastWeight: 0,
      lastReps: Number(exercise.reps.match(/\d+/)?.[0] ?? 10),
      technique: exercise.notes || exercise.tempoNotes || 'Siga as orientações do seu profissional.',
      demoLabel: name,
      videoUrl: exercise.videoUrl,
    };
  });
  const muscleGroups = [...new Set(exercises.map((exercise) => exercise.muscle).filter((muscle) => muscle !== 'Exercício'))];
  const setCount = exercises.reduce((total, exercise) => total + exercise.sets, 0);
  return {
    id: `library-${workout.workoutId ?? workout.assignmentId}`,
    title: workout.title,
    focus: muscleGroups.slice(0, 3).join(' · ') || 'Treino prescrito',
    durationMin: Math.max(20, Math.round(setCount * 2.5)),
    exercises,
  };
}

/**
 * Biblioteca: nível 1 = TIPO de treino; nível 2 = QUEM PASSOU (profissional ou
 * Market). Protocolo vigente vira card-acordeão (treinos deduplicados por nome —
 * o mesociclo clona um por semana); avulsos/comprados aparecem como treino único
 * (comprado ganha badge Market). Exercícios não aparecem aqui — só no Player.
 */
function Library() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groups, isLoading } = useTrainingLibrary();
  const { workouts } = useStudentWorkouts();
  const { startWorkoutNow, startGuided } = useTraining();
  const byAssignment = useMemo(() => new Map(workouts.map((workout) => [workout.assignmentId, workout])), [workouts]);
  // Exercícios do treino (mesmo mapeamento do Player) para a prévia expansível.
  const exercisesFor = (assignmentId: string) => {
    const workout = byAssignment.get(assignmentId);
    return workout ? playerTemplate(workout).exercises : undefined;
  };

  const start = (assignmentId: string) => {
    const workout = byAssignment.get(assignmentId);
    if (!workout) return;
    // Não-musculação → player guiado (deriva os passos do treino).
    const guidedPlan = toGuidedWorkout(workout);
    if (guidedPlan) {
      startGuided({ scheduledId: `guided-${workout.assignmentId}`, workoutId: workout.workoutId, assignmentId: workout.assignmentId, title: workout.title, surface: workout.trainingType, plan: guidedPlan });
      navigate('/meu-fit/treino/player/guiado');
      return;
    }
    const template = playerTemplate(workout);
    if (startWorkoutNow(template, workout.trainingType)) navigate('/meu-fit/treino/player');
  };

  if (isLoading) {
    return <section className="mt-6 space-y-3">{[0, 1, 2].map((index) => <div key={index} className="h-[88px] animate-pulse rounded-3xl bg-surface-container motion-reduce:animate-none" />)}</section>;
  }
  if (!groups.length) {
    return (
      <section className="mt-6 rounded-2xl border border-dashed border-outline-variant/40 px-4 py-6">
        <p className="font-sans text-label text-on-surface">{t('meufit.training.library.emptyTitle')}</p>
        <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.library.emptyDescription')}</p>
      </section>
    );
  }

  return (
    <section className="mt-6 space-y-9">
      {groups.map((group) => (
        <div key={group.type}>
          {/* Nível 1: tipo de treino */}
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant" aria-hidden>{surfaceIcon[group.type]}</span>
            <h3 className="font-sans text-title text-on-surface">{t(surfaceTranslationKey[group.type])}</h3>
          </div>
          <div className="mt-4 space-y-6">
            {group.authors.map((author) => (
              <div key={author.key}>
                {/* Nível 2: quem passou */}
                <div className="mb-2.5 flex items-center gap-1.5 px-1">
                  {author.isMarket ? (
                    <MarketBadge />
                  ) : (
                    <>
                      <User size={13} className="text-on-surface-variant" aria-hidden />
                      <span className="font-sans text-counter text-on-surface-variant">{author.name || t('meufit.training.library.byPro')}</span>
                    </>
                  )}
                </div>
                <div className="space-y-3">
                  {author.protocols.map((protocol) => <ProtocolCard key={protocol.cycleId} protocol={protocol} onStart={start} exercisesFor={exercisesFor} />)}
                  {author.workouts.map((workout) => <LibraryWorkoutRow key={workout.assignmentId} workout={workout} exercises={exercisesFor(workout.assignmentId)} onStart={() => start(workout.assignmentId)} asCard />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function MarketBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-sans text-counter text-primary">
      <ShoppingBag size={11} aria-hidden />
      {t('meufit.training.library.market')}
    </span>
  );
}

function ProtocolCard({ protocol, onStart, exercisesFor }: { protocol: LibraryProtocol; onStart: (assignmentId: string) => void; exercisesFor: (assignmentId: string) => WorkoutTemplate['exercises'] | undefined }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const subtitle = [
    protocol.currentWeek && protocol.totalWeeks ? t('meufit.training.library.weekProgress', { week: protocol.currentWeek, total: protocol.totalWeeks }) : null,
    t(protocol.workouts.length === 1 ? 'meufit.training.library.workoutCount' : 'meufit.training.library.workoutCountPlural', { count: protocol.workouts.length }),
  ].filter(Boolean).join(' · ');

  return (
    <article className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left transition-colors duration-150 hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="shrink-0 text-primary" aria-hidden><Layers size={18} /></span>
        <div className="min-w-0 flex-1">
          <h4 className="font-sans text-label leading-snug text-on-surface">{protocol.name}</h4>
          <p className="mt-0.5 font-sans text-body-sm tabular-nums text-on-surface-variant">{subtitle}</p>
        </div>
        <ChevronDown size={18} className={clsx('shrink-0 text-on-surface-variant transition-transform duration-200', open ? 'rotate-180' : 'rotate-0')} aria-hidden />
      </button>
      {open ? (
        <div className="border-t border-outline-variant/20 bg-surface-container-lowest">
          {protocol.workouts.map((workout) => <LibraryWorkoutRow key={workout.assignmentId} workout={workout} exercises={exercisesFor(workout.assignmentId)} onStart={() => onStart(workout.assignmentId)} />)}
        </div>
      ) : null}
    </article>
  );
}

/** Linha de treino da Biblioteca. `asCard` = avulso (card próprio); sem = dentro do acordeão do protocolo. */
function LibraryWorkoutRow({ workout, exercises, onStart, asCard = false }: { workout: LibraryWorkout; exercises?: WorkoutTemplate['exercises']; onStart: () => void; asCard?: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  // Setinha discreta à esquerda revela os exercícios sem abrir o treino.
  const canExpand = (exercises?.length ?? 0) > 0;
  return (
    <div className={clsx(asCard ? 'overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container' : 'border-b border-outline-variant/15 last:border-b-0')}>
      <div className={clsx('flex items-center gap-3', asCard ? 'p-4' : 'px-4 py-3')}>
        {canExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={t(expanded ? 'meufit.training.hideExercises' : 'meufit.training.showExercises')}
            className="-ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-on-surface-variant/30 transition-colors duration-150 hover:text-on-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronDown size={16} className={clsx('transition-transform duration-200', expanded ? 'rotate-180' : 'rotate-0')} aria-hidden />
          </button>
        ) : asCard ? (
          <span className="shrink-0 text-on-surface-variant" aria-hidden>{surfaceIcon[workout.trainingType]}</span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 font-sans text-label leading-snug text-on-surface">{workout.title}</p>
            {workout.isMarket && asCard ? <MarketBadge /> : null}
          </div>
          <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{workout.exerciseCount ? t(workout.exerciseCount === 1 ? 'meufit.training.library.exerciseCount' : 'meufit.training.library.exerciseCountPlural', { count: workout.exerciseCount }) : t('meufit.training.library.noExercises')}</p>
        </div>
        {workout.exerciseCount ? (
          <button type="button" onClick={onStart} className="flex min-h-10 shrink-0 items-center gap-1.5 font-sans text-label text-primary transition-opacity duration-150 hover:opacity-80 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Play size={15} fill="currentColor" aria-hidden />
            {t('meufit.training.library.doNow')}
          </button>
        ) : null}
      </div>
      {expanded && canExpand ? <WorkoutExercisePreview exercises={exercises ?? []} emptyLabel={t('meufit.training.today.noExercises')} /> : null}
    </div>
  );
}

function AppleHealthCard({ appleHealth, compact }: { appleHealth: AppleHealthState; compact?: boolean }) {
  const { t } = useTranslation();
  const hasImportedData = appleHealth.importedActivities.length > 0 || appleHealth.dailySummaries.length > 0;
  const hasCompletedSync = Boolean(appleHealth.connection?.last_sync_at) || hasImportedData;
  const connected = appleHealth.connection?.status === 'connected' && hasCompletedSync;
  const hasQueryError = appleHealth.connectionError || appleHealth.activitiesError || appleHealth.dailySummariesError;
  const waitingForNativeState = appleHealth.isNativeIos && appleHealth.isLoading && !appleHealth.connection;
  const unavailable = !appleHealth.available && !appleHealth.isLoading;
  if (!appleHealth.isNativeIos && !hasQueryError) return null;
  const syncing = appleHealth.sync.isPending;
  const lastSync = appleHealth.connection?.last_sync_at
    ? new Date(appleHealth.connection.last_sync_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  const error = appleHealth.sync.error instanceof Error
    ? appleHealth.sync.error.message
    : appleHealth.connection?.last_error;

  return (
    <section className={clsx('mt-4 rounded-2xl border border-outline-variant/40 bg-surface-container p-4', compact && connected && 'py-3')}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary">
          <Watch size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-sans text-label text-on-surface">{t('health.apple.title')}</h2>
              <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
                {waitingForNativeState
                  ? t('common.loading')
                  : unavailable
                  ? (appleHealth.availabilityReason || t('health.apple.unavailable'))
                  : connected
                    ? `${t('health.apple.connected')}${lastSync ? ` · ${lastSync}` : ''}`
                    : t('health.apple.description')}
              </p>
            </div>
            {connected && appleHealth.isNativeIos ? (
              <button
                type="button"
                onClick={() => appleHealth.sync.mutate('manual')}
                disabled={syncing}
                className="min-h-10 shrink-0 rounded-full bg-primary px-4 font-sans text-counter text-on-primary transition-opacity duration-150 enabled:hover:opacity-90 enabled:active:opacity-80 disabled:opacity-60"
              >
                {syncing ? t('health.apple.syncing') : t('health.apple.sync')}
              </button>
            ) : null}
          </div>

          {!connected && !unavailable && !waitingForNativeState ? (
            <div className="mt-4 space-y-3">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/35 bg-surface px-3 py-3">
                <span className="font-sans text-body-sm text-on-surface">{t('health.apple.shareWithCoach')}</span>
                <input
                  type="checkbox"
                  checked={appleHealth.shareWithCoach}
                  onChange={(event) => appleHealth.setShareWithCoach(event.target.checked)}
                  className="h-5 w-5 accent-primary"
                />
              </label>
              <button
                type="button"
                onClick={() => appleHealth.sync.mutate('initial')}
                disabled={syncing}
                className="min-h-12 w-full rounded-xl bg-primary font-sans text-label text-on-primary transition-opacity duration-150 enabled:hover:opacity-90 enabled:active:opacity-80 disabled:opacity-60"
              >
                {syncing ? t('health.apple.connecting') : t('health.apple.connect')}
              </button>
            </div>
          ) : null}

          {appleHealth.lastSyncMessage ? <p className="mt-3 font-sans text-counter text-primary">{appleHealth.lastSyncMessage}</p> : null}
          {connected && !appleHealth.isLoading && !hasImportedData && !hasQueryError ? <p className="mt-3 font-sans text-body-sm text-on-surface-variant">{t('health.apple.noImportedActivities')}</p> : null}
          {hasQueryError ? (
            <div className="mt-3 flex items-center gap-3">
              <p className="font-sans text-body-sm text-error">{t('health.apple.historyLoadError')}</p>
              <button type="button" onClick={() => void appleHealth.refetch()} className="shrink-0 font-sans text-counter font-semibold text-primary">{t('common.retry')}</button>
            </div>
          ) : null}
          {error ? <p className="mt-3 font-sans text-body-sm text-error">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}

/** Histórico cronológico agrupado por dia; métricas adicionais ficam no detalhe. */
type HistoryEntry = { id: string; title: string; meta: string; status: TrainingStatus; surface: TrainingSurface; importedFromWatch: boolean; activity?: ImportedActivity };

function HistoryList({ imported, onOpenDay, onOpenActivity, onRecord }: { imported: ImportedActivity[]; onOpenDay: (date: string) => void; onOpenActivity: (activity: ImportedActivity) => void; onRecord: () => void }) {
  const { t } = useTranslation();
  const { scheduled } = useTraining();
  const byDate = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    const push = (date: string, entry: HistoryEntry) => {
      const list = map.get(date) ?? [];
      list.push(entry);
      map.set(date, list);
    };
    scheduled.filter((item) => ['completed', 'partial', 'missed'].includes(item.status)).forEach((item) => push(item.date, { id: item.id, title: item.title, meta: item.summary ?? `${item.durationMin} min · ${statusLabel[item.status].toLowerCase()}`, status: item.status, surface: item.surface, importedFromWatch: false }));
    imported.forEach((item) => push(item.date, { id: item.id, title: item.title, meta: formatActivityMeta(item), status: 'imported', surface: item.surface, importedFromWatch: Boolean(item.importedFromWatch), activity: item }));
    return map;
  }, [imported, scheduled]);

  const days = useMemo(() => [...byDate.keys()].sort((a, b) => b.localeCompare(a)), [byDate]);

  return (
    <section className="mt-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="min-w-0 font-sans text-title-lg text-on-surface">{t('meufit.training.tabs.history')}</h2>
        <button type="button" onClick={onRecord} className="flex min-h-10 shrink-0 items-center gap-1.5 font-sans text-label text-primary transition-opacity hover:opacity-80 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={t('meufit.training.history.record')}>
          <Plus size={16} aria-hidden />
          {t('meufit.training.history.record')}
        </button>
      </div>
      <div className="mt-6 space-y-6">
        {days.length ? days.map((date) => {
          const entries = byDate.get(date)!;
          return (
            <div key={date}>
              <button type="button" onClick={() => onOpenDay(date)} className="flex w-full items-baseline gap-2 rounded-lg py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={t('meufit.training.history.openDay', { day: `${weekdayFull(date)} ${historyDate(date)}` })}>
                <span className="font-sans text-label capitalize text-on-surface">{weekdayFull(date)}</span>
                <span className="font-sans text-counter text-on-surface-variant">· {historyDate(date)}</span>
              </button>
              <div className="mt-1.5 divide-y divide-outline-variant/20 border-y border-outline-variant/15">
                {entries.map((item) => <HistoryRow key={item.id} {...item} onOpenActivity={onOpenActivity} />)}
              </div>
            </div>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-outline-variant/40 px-5 py-8 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container text-on-surface-variant"><Activity size={22} aria-hidden /></span>
            <p className="font-sans text-label text-on-surface">{t('meufit.training.history.emptyTitle')}</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.history.emptyDescription')}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function HistoryRow({ title, meta, status, surface, activity, onOpenActivity }: HistoryEntry & { onOpenActivity: (activity: ImportedActivity) => void }) {
  const { t } = useTranslation();
  const content = (
    <>
      <TrainingBadge surface={surface} status={status} />
      <span className="min-w-0 flex-1">
        <span className="min-w-0 break-words font-sans text-label leading-snug text-on-surface">{title}</span>
        <span className="mt-0.5 block break-words font-sans text-body-sm leading-snug text-on-surface-variant">{activity ? `${meta} · ${activitySourceLabel(activity)}` : meta}</span>
      </span>
      {activity ? <ChevronRight size={18} className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden /> : null}
    </>
  );
  if (!activity) return <div className="flex items-start gap-3 px-1 py-3.5">{content}</div>;
  return <button type="button" onClick={() => onOpenActivity(activity)} aria-label={t('meufit.training.history.openActivity', { title })} className="flex w-full items-start gap-3 rounded-lg px-1 py-3.5 text-left transition-colors hover:bg-surface-container/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{content}</button>;
}

/** Calendário mensal de consistência: intensidade real por dia; tocar abre o detalhe. */
function Heatmap({ selectedDate, healthDays, scheduled, onSelect }: { selectedDate: string; healthDays: Map<string, HealthDay>; scheduled: ScheduledWorkout[]; onSelect: (value: string) => void }) {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState(() => new Date(`${selectedDate}T12:00:00`));
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const days = Array.from({ length: firstDay + new Date(year, month + 1, 0).getDate() }, (_, index) => index < firstDay ? null : new Date(year, month, index - firstDay + 1));
  const todayValue = today();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthDays = [...healthDays.values()].filter((day) => day.date.startsWith(monthPrefix));
  const activeDays = monthDays.filter((day) => day.hasData && day.intensity > 0).length;

  return (
    <section>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface transition-colors duration-150 hover:bg-surface-container-high active:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={t('meufit.training.progress.prevMonth')}><ChevronLeft size={20} /></button>
        <div className="text-center">
          <span className="block font-sans text-title capitalize text-on-surface">{cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
          <span className="mt-0.5 block font-sans text-counter text-on-surface-variant">{t('meufit.training.progress.activeDaysCount', { count: activeDays })}</span>
        </div>
        <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface transition-colors duration-150 hover:bg-surface-container-high active:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={t('meufit.training.progress.nextMonth')}><ChevronRight size={20} /></button>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1.5">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((name, index) => <span key={`${name}-${index}`} className="pb-1 text-center font-sans text-nav uppercase text-on-surface-variant">{name}</span>)}
        {days.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} />;
          const value = dateKey(date);
          const day = healthDays.get(value);
          const selected = value === selectedDate;
          const item = scheduled.find((entry) => entry.date === value);
          return (
            <button key={value} type="button" onClick={() => onSelect(value)} className={clsx('relative flex aspect-square flex-col items-center justify-center rounded-xl font-sans text-body-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', heatClass(day, selected), value === todayValue && !selected && 'ring-1 ring-inset ring-primary')} aria-label={`${date.toLocaleDateString('pt-BR')}${day?.activities.length ? `, ${day.activities.length} atividade(s)` : ''}`}>
              {date.getDate()}
              {item ? <span className={clsx('absolute bottom-1 h-1 w-1 rounded-full', selected ? 'bg-on-primary' : statusTone[item.status])} /> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-center gap-2 font-sans text-counter text-on-surface-variant">
        <span>{t('meufit.training.heatmap.less')}</span>
        <span className="h-3 w-3 rounded bg-surface-container-high" />
        <span className="h-3 w-3 rounded bg-primary/15" />
        <span className="h-3 w-3 rounded bg-primary/30" />
        <span className="h-3 w-3 rounded bg-primary/55" />
        <span className="h-3 w-3 rounded bg-primary/85" />
        <span>{t('meufit.training.heatmap.more')}</span>
      </div>
    </section>
  );
}

function TrainingBadge({ surface, status }: { surface: TrainingSurface; status: TrainingStatus }) {
  const completed = status === 'completed' || status === 'imported';
  const missed = status === 'missed';
  return (
    <span
      className={clsx(
        'mt-0.5 shrink-0',
        completed && 'text-primary',
        missed && 'text-error',
        !completed && !missed && 'text-on-surface-variant',
      )}
      aria-hidden
    >
      {surfaceIcon[surface]}
    </span>
  );
}

const surfaces: { value: TrainingSurface; label: string; icon: ReactNode }[] = [
  { value: 'strength', label: 'Força', icon: <Dumbbell size={18} /> },
  { value: 'running', label: 'Corrida', icon: <Activity size={18} /> },
  { value: 'cycling', label: 'Bike', icon: <Bike size={18} /> },
  { value: 'walking', label: 'Caminhada', icon: <Footprints size={18} /> },
  { value: 'hiit', label: 'HIIT', icon: <Flame size={18} /> },
  { value: 'other', label: 'Outro', icon: <Plus size={18} /> },
];

function AddActivitySheet({
  open,
  onClose,
  selectedDate,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  selectedDate: string;
  onAdd: (activity: { date: string; title: string; durationMin: number; surface: TrainingSurface; source: ActivitySource; distanceKm?: number; calories?: number; averageHeartRate?: number; elevationM?: number }) => void;
}) {
  const [surface, setSurface] = useState<TrainingSurface>('strength');
  const [duration, setDuration] = useState(55);
  const [distance, setDistance] = useState('5,0');
  const [calories, setCalories] = useState('420');
  const [averageHeartRate, setAverageHeartRate] = useState('145');
  const [elevation, setElevation] = useState('');

  const selectedSurface = surfaces.find((item) => item.value === surface) ?? surfaces[0];
  const isEndurance = enduranceSurfaces.includes(surface);
  const readNumber = (value: string) => Number(String(value).replace(',', '.')) || undefined;
  const activityMetrics = {
    distanceKm: isEndurance ? readNumber(distance) : undefined,
    calories: readNumber(calories),
    averageHeartRate: readNumber(averageHeartRate),
    elevationM: isEndurance ? readNumber(elevation) : undefined,
  };

  const addManual = () => {
    onAdd({
      date: selectedDate,
      title: selectedSurface.value === 'strength' ? 'Treino de força registrado' : `${selectedSurface.label} registrada`,
      durationMin: duration,
      surface,
      source: 'manual',
      ...activityMetrics,
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Adicionar registro"
      description="Registro manual feito fora do Player. Para Apple Health, use o card de conexão real em Treinos."
      panelClassName="max-h-[92%]"
    >
      <div className="space-y-5 px-5 pb-6">
        <div>
          <p className="font-sans text-label text-on-surface">Modalidade</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {surfaces.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setSurface(item.value)}
                className={clsx(
                  'flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-xl border font-sans text-counter',
                  surface === item.value
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-outline-variant/35 bg-surface-container text-on-surface-variant',
                )}
              >
                <span className={surface === item.value ? 'text-on-primary' : 'text-on-surface-variant'}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-outline-variant/35 bg-surface-container p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-sans text-counter text-on-surface-variant">Duração</p>
              <p className="mt-1 font-sans text-title-lg text-on-surface">{duration} min</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDuration((value) => Math.max(5, value - 5))}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-high text-on-surface"
                aria-label="Diminuir duração"
              >
                <ChevronLeft size={19} />
              </button>
              <button
                type="button"
                onClick={() => setDuration((value) => value + 5)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary"
                aria-label="Aumentar duração"
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {isEndurance ? (
            <MetricInput label="Distância" value={distance} onChange={setDistance} suffix="km" inputMode="decimal" />
          ) : null}
          <MetricInput label="Calorias" value={calories} onChange={setCalories} suffix="kcal" inputMode="numeric" />
          <MetricInput label="FC média" value={averageHeartRate} onChange={setAverageHeartRate} suffix="bpm" inputMode="numeric" />
          {isEndurance ? (
            <MetricInput label="Elevação" value={elevation} onChange={setElevation} suffix="m" inputMode="numeric" optional />
          ) : null}
        </div>

        <button
          type="button"
          onClick={addManual}
          className="min-h-12 w-full rounded-xl bg-primary font-sans text-label text-on-primary transition-opacity duration-150 hover:opacity-90 active:opacity-80"
        >
          Salvar registro
        </button>
      </div>
    </BottomSheet>
  );
}

function MetricInput({
  label,
  value,
  onChange,
  suffix,
  inputMode,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  inputMode: 'numeric' | 'decimal';
  optional?: boolean;
}) {
  return (
    <label className="rounded-2xl border border-outline-variant/35 bg-surface-container px-4 py-3">
      <span className="font-sans text-counter text-on-surface-variant">
        {label}{optional ? ' opcional' : ''}
      </span>
      <div className="mt-1 flex items-baseline gap-1">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode={inputMode}
          placeholder="0"
          className="min-w-0 flex-1 bg-transparent font-sans text-title text-on-surface outline-none placeholder:text-on-surface-variant/45"
        />
        <span className="font-sans text-counter text-on-surface-variant">{suffix}</span>
      </div>
    </label>
  );
}
