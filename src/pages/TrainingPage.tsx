import { useMemo, useState, type ReactNode } from 'react';
import { Activity, Bike, CalendarX2, ChevronLeft, ChevronRight, Droplet, Dumbbell, Flame, Footprints, Gauge, HeartPulse, Info, Leaf, ListChecks, MapPin, Moon, Play, Plus, RotateCcw, Sparkles, Timer, Waves, Watch, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { ActivityRing, MetricStat } from '@/components/health/HealthVisuals';
import { type ActivitySource, type ImportedActivity, type ScheduledWorkout, type TrainingStatus, type TrainingSurface, type WorkoutTemplate, useTraining } from '@/features/training/TrainingProvider';
import { DAY_CODES, uniqueWorkouts, useStudentWorkouts, type StudentWorkout, type WorkoutTrainingType } from '@/features/training/useStudentWorkouts';
import { useAppleHealth } from '@/features/wearables/useAppleHealth';
import { buildHealthDays, formatSleep, type HealthDay } from '@/features/wearables/healthDays';
import { activityMetaLine, activityMetrics, activitySportDetails, paceMinPerKm, PACE_SURFACES } from '@/features/wearables/sportActivityMetrics';
import { localDateKey, todayKey } from '@/lib/localDate';
import { useTranslation, type TranslationKey } from '@/i18n/I18nProvider';
import { BLOCK_ROLE_KEYS, SPECIFIC_FIELDS } from '@/features/profile/offerings/workoutPrescription';

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
  const source = sourceLabel(activity.source);
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

function WatchOriginChip() {
  return (
    <span className="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 font-sans text-counter text-primary">
      <Watch size={12} aria-hidden />
      Watch
    </span>
  );
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
      <div className="grid grid-cols-4 gap-1 rounded-full bg-surface-container p-1" role="tablist" aria-label={t('meufit.training.tabs.aria')}>{([['today', t('meufit.training.tabs.today')], ['history', t('meufit.training.tabs.history')], ['progress', t('meufit.training.tabs.progress')], ['library', t('meufit.training.tabs.library')]] as [Tab, string][]).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={clsx('flex min-h-[40px] items-center justify-center rounded-full font-sans text-counter transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', tab === value ? 'bg-surface-container-lowest text-on-surface' : 'text-on-surface-variant hover:text-on-surface active:text-on-surface')}>{label}</button>)}</div>
      {tab !== 'today' ? <AppleHealthCard appleHealth={appleHealth} compact /> : null}
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
  const workouts = items.filter((item) => item.status !== 'rest' && item.status !== 'missed');
  const types = Array.from(new Set(workouts.map((item) => item.surface)));

  return (
    <section className="mt-6">
      <h2 className="font-sans text-title-lg text-on-surface">{t('meufit.training.today.heading')}</h2>
      <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.today.subtitle')}</p>
      {types.length ? (
        <div className="mt-6 space-y-8">
          {types.map((surface) => {
            const surfaceWorkouts = workouts.filter((item) => item.surface === surface);
            const surfaceActive = active?.surface === surface;
            const duration = surfaceWorkouts.reduce((total, item) => total + item.durationMin, 0);
            return (
              <div key={surface}>
                {/* Cabeçalho da categoria: deixa claro o grupo (ex.: Força) sem exigir entrar nele. */}
                <div className="flex items-center gap-3">
                  <TrainingBadge surface={surface} status={surfaceActive ? 'active' : surfaceWorkouts[0].status} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-sans text-title text-on-surface">{t(surfaceTranslationKey[surface])}</h3>
                    <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
                      {t(surfaceWorkouts.length === 1 ? 'meufit.training.today.workoutCount' : 'meufit.training.today.workoutCountPlural', { count: surfaceWorkouts.length })} · {t('meufit.training.today.minutes', { minutes: duration })}
                    </p>
                  </div>
                  {surfaceActive ? <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 font-sans text-counter text-primary">{t('meufit.training.today.inProgress')}</span> : null}
                </div>
                <div className="mt-4 space-y-4">
                  {surfaceWorkouts.map((item) => <TodayWorkoutCard key={item.id} item={item} />)}
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
 * Card de treino do dia — acionável direto, acabamento premium por contenção:
 * título forte, chips de métrica com números tabulares, lista de exercícios numa
 * banda tonal recuada e CTA em pílula lime (a única voz de cor). Sem sombra, sem
 * neon: profundidade é tonal (ramp de surface-containers).
 */
function TodayWorkoutCard({ item }: { item: ScheduledWorkout }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { templates, startSession, activeSession, skipToday } = useTraining();
  const template = templates.find((entry) => entry.id === item.templateId);
  const exerciseCount = template?.exercises.length ?? 0;
  const isActive = activeSession?.scheduledId === item.id;
  const canStart = item.canStart !== false && (item.status === 'planned' || item.status === 'active' || item.status === 'partial');
  const highlighted = isActive || item.status === 'active';

  return (
    <article className={clsx('overflow-hidden rounded-3xl border bg-surface-container transition-colors', highlighted ? 'border-primary/40 bg-primary/[0.05]' : 'border-outline-variant/40')}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 font-sans text-title leading-tight text-on-surface">{item.title}</h3>
          {item.status !== 'planned' ? (
            <span className={clsx('shrink-0 rounded-full px-2.5 py-1 font-sans text-counter', highlighted ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant')}>{statusLabel[item.status]}</span>
          ) : null}
        </div>
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1 font-sans text-counter tabular-nums text-on-surface-variant"><Timer size={13} aria-hidden />{t('meufit.training.today.minutes', { minutes: item.durationMin })}</span>
          {exerciseCount ? <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1 font-sans text-counter tabular-nums text-on-surface-variant"><ListChecks size={13} aria-hidden />{t(exerciseCount === 1 ? 'meufit.training.library.exerciseCount' : 'meufit.training.library.exerciseCountPlural', { count: exerciseCount })}</span> : null}
          {item.focus ? <span className="inline-flex items-center rounded-full bg-surface-container-high px-3 py-1 font-sans text-counter text-on-surface-variant">{item.focus}</span> : null}
        </div>
      </div>

      {template?.exercises.length ? (
        <ol className="divide-y divide-outline-variant/15 border-y border-outline-variant/20 bg-surface-container-lowest">
          {template.exercises.map((exercise, index) => (
            <li key={exercise.id} className="flex items-center gap-3.5 px-5 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-surface-container-high font-sans text-counter tabular-nums text-on-surface">{String(index + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-sans text-label text-on-surface">{exercise.name}</span>
                <span className="mt-0.5 block font-sans text-body-sm tabular-nums text-on-surface-variant">{exercise.muscle} · {exercise.sets} × {exercise.targetReps}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="border-y border-outline-variant/20 bg-surface-container-lowest px-5 py-4 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.today.noExercises')}</p>
      )}

      <div className="p-4">
        {canStart ? (
          <button type="button" onClick={() => { startSession(item.id); navigate('/meu-fit/treino/player'); }} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary font-sans text-label text-on-primary transition-opacity duration-150 enabled:hover:opacity-90 enabled:active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container disabled:cursor-not-allowed disabled:bg-surface-container-high disabled:text-on-surface-variant">
            <Play size={18} fill="currentColor" aria-hidden />
            {t(isActive ? 'meufit.training.today.continue' : 'meufit.training.today.start')}
          </button>
        ) : null}
        {item.status === 'planned' ? (
          <button type="button" onClick={() => skipToday(item.id)} className="mt-1.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-full font-sans text-counter text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-high active:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <CalendarX2 size={16} aria-hidden />
            {t('meufit.training.today.skip')}
          </button>
        ) : null}
      </div>
    </article>
  );
}

/** Conteúdo do dia: anel de energia, métricas, atividades e treinos, usado nos detalhes do Histórico e Progresso. */
function DayDetailContent({ date, healthDays, scheduled, showScheduled = true, onOpenActivity }: { date: string; healthDays: Map<string, HealthDay>; scheduled: ScheduledWorkout[]; showScheduled?: boolean; onOpenActivity?: (activity: ImportedActivity) => void }) {
  const navigate = useNavigate();
  const { startSession, reschedule } = useTraining();
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
          {item.status === 'planned' && item.canStart !== false ? <button type="button" onClick={() => { startSession(item.id); navigate('/meu-fit/treino/player'); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary" aria-label={`Começar ${item.title}`}><Play size={16} fill="currentColor" aria-hidden /></button> : null}
          {item.status === 'missed' ? <button type="button" onClick={() => reschedule(item.id)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-primary" aria-label={`Reagendar ${item.title}`}><RotateCcw size={16} aria-hidden /></button> : null}
        </div>
      ))}

      {(day?.activities ?? []).map((activity) => (
        <button key={activity.id} type="button" onClick={() => onOpenActivity?.(activity)} className="flex w-full items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface p-3 text-left transition-colors duration-150 hover:bg-surface-container-high active:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <TrainingBadge surface={activity.surface} status="imported" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-sans text-label text-on-surface">{activity.title}</p>
              {activity.importedFromWatch ? <WatchOriginChip /> : null}
            </div>
            <p className="mt-0.5 break-words font-sans text-body-sm text-on-surface-variant">{formatActivityMeta(activity)}</p>
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

const DAY_SHORT: Record<string, string> = { DOM: 'dom', SEG: 'seg', TER: 'ter', QUA: 'qua', QUI: 'qui', SEX: 'sex', SAB: 'sáb' };

/** Mini-strip dos 7 dias, destacando aqueles em que o treino é aplicado. */
function WeekdayStrip({ days }: { days: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {DAY_CODES.map((code) => {
        const active = days.includes(code);
        return (
          <span key={code} className={clsx('inline-flex min-w-[34px] justify-center rounded-md px-1.5 py-1 font-sans text-nav', active ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant/60')}>{DAY_SHORT[code]}</span>
        );
      })}
    </div>
  );
}

type WorkoutGroup = { type: WorkoutTrainingType; workouts: StudentWorkout[]; exerciseCount: number };

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

/** Biblioteca: primeiro os tipos; depois, os treinos daquele grupo. */
function Library() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeSession, startWorkoutNow } = useTraining();
  const { workouts, isLoading } = useStudentWorkouts();
  const items = useMemo(() => uniqueWorkouts(workouts), [workouts]);
  const [selectedType, setSelectedType] = useState<WorkoutTrainingType | null>(null);
  const [prescriptionWorkout, setPrescriptionWorkout] = useState<StudentWorkout | null>(null);
  const groups = useMemo<WorkoutGroup[]>(() => {
    const byType = new Map<WorkoutTrainingType, StudentWorkout[]>();
    for (const workout of items) {
      const group = byType.get(workout.trainingType) ?? [];
      group.push(workout);
      byType.set(workout.trainingType, group);
    }
    return [...byType.entries()].map(([type, groupedWorkouts]) => ({
      type,
      workouts: groupedWorkouts,
      exerciseCount: groupedWorkouts.reduce((total, workout) => total + workout.exerciseCount, 0),
    }));
  }, [items]);
  const selectedGroup = selectedType ? groups.find((group) => group.type === selectedType) ?? null : null;

  if (selectedGroup) {
    return (
      <>
      <section className="mt-6">
        <button type="button" onClick={() => setSelectedType(null)} className="inline-flex min-h-11 items-center gap-2 font-sans text-label text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={t('meufit.training.library.backToTypes')}>
          <ChevronLeft size={18} aria-hidden />
          {t('meufit.training.library.backToTypes')}
        </button>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant" aria-hidden>{surfaceIcon[selectedGroup.type]}</span>
          <div>
            <h2 className="font-sans text-title-lg text-on-surface">{t(surfaceTranslationKey[selectedGroup.type])}</h2>
            <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{t(selectedGroup.workouts.length === 1 ? 'meufit.training.library.workoutCount' : 'meufit.training.library.workoutCountPlural', { count: selectedGroup.workouts.length })}</p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {selectedGroup.workouts.map((workout) => {
            const template = playerTemplate(workout);
            const isCurrentWorkout = activeSession?.templateId === template.id;
            const hasExercises = template.exercises.length > 0;
            const hasPrescription = Boolean(workout.prescription);
            return (
              <article key={workout.workoutId ?? workout.assignmentId} className="rounded-2xl border border-outline-variant/40 bg-surface-container p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>{surfaceIcon[workout.trainingType]}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-sans text-label leading-snug text-on-surface">{workout.title}</h3>
                    <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{t(workout.exerciseCount === 1 ? 'meufit.training.library.exerciseCount' : 'meufit.training.library.exerciseCountPlural', { count: workout.exerciseCount })}</p>
                    {workout.weeks.length ? <span className="mt-2 inline-flex items-center rounded-full bg-surface-container-high px-2.5 py-1 font-sans text-counter text-on-surface-variant">{workout.weeks.length === 1 ? t('meufit.training.library.weekSingle', { n: workout.weeks[0] }) : t('meufit.training.library.weekRange', { from: workout.weeks[0], to: workout.weeks[workout.weeks.length - 1] })}</span> : null}
                  </div>
                </div>
                {workout.daysOfWeek.length ? <div className="mt-3 border-t border-outline-variant/30 pt-3"><WeekdayStrip days={workout.daysOfWeek} /></div> : null}
                <div className="mt-4 flex gap-2">
                  {hasPrescription && <button type="button" onClick={() => setPrescriptionWorkout(workout)} className={clsx('min-h-12 flex-1 rounded-xl px-3 font-sans text-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', hasExercises ? 'bg-surface-container-high text-primary' : 'bg-primary text-on-primary')}>{t('meufit.training.library.viewPrescription')}</button>}
                  {hasExercises && <button
                    type="button"
                    onClick={() => {
                      if (startWorkoutNow(template, workout.trainingType)) navigate('/meu-fit/treino/player');
                    }}
                    className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 font-sans text-label text-on-primary transition-opacity duration-150 enabled:hover:opacity-90 enabled:active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container disabled:cursor-not-allowed disabled:bg-surface-container-high disabled:text-on-surface-variant"
                  >
                    <Play size={18} fill="currentColor" aria-hidden />
                    {t(isCurrentWorkout ? 'meufit.training.library.continue' : 'meufit.training.library.doNow')}
                  </button>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <WorkoutPrescriptionSheet workout={prescriptionWorkout} onClose={() => setPrescriptionWorkout(null)} />
      </>
    );
  }

  return (
    <section className="mt-6 space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-sans text-title text-on-surface">{t('meufit.training.library.chooseType')}</h2>
          <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.library.chooseTypeDescription')}</p>
        </div>
        {items.length ? <span className="shrink-0 font-sans text-counter text-on-surface-variant">{t(items.length === 1 ? 'meufit.training.library.workoutCount' : 'meufit.training.library.workoutCountPlural', { count: items.length })}</span> : null}
      </div>
      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((index) => <div key={index} className="h-[104px] animate-pulse rounded-2xl bg-surface-container motion-reduce:animate-none" />)}</div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-outline-variant/40 px-4 py-6 font-sans text-body-sm text-on-surface-variant">Nenhum treino aplicado ainda. Quando seu profissional montar seu treino, ele aparece aqui.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <button key={group.type} type="button" onClick={() => setSelectedType(group.type)} className="flex min-h-[76px] w-full items-center gap-4 rounded-2xl border border-outline-variant/40 bg-surface-container px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-container-high active:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={t('meufit.training.library.openType', { type: t(surfaceTranslationKey[group.type]) })}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant" aria-hidden>{surfaceIcon[group.type]}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-label text-on-surface">{t(surfaceTranslationKey[group.type])}</span>
                <span className="mt-1 block font-sans text-body-sm text-on-surface-variant">
                  {t(group.workouts.length === 1 ? 'meufit.training.library.workoutCount' : 'meufit.training.library.workoutCountPlural', { count: group.workouts.length })} · {t(group.exerciseCount === 1 ? 'meufit.training.library.exerciseCount' : 'meufit.training.library.exerciseCountPlural', { count: group.exerciseCount })}
                </span>
              </span>
              <ChevronRight size={20} className="shrink-0 text-on-surface-variant" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkoutPrescriptionSheet({ workout, onClose }: { workout: StudentWorkout | null; onClose: () => void }) {
  const { t } = useTranslation();
  const prescription = workout?.prescription;
  if (!workout || !prescription) return null;
  const sessionDetails = [
    [t('offer.workout.field.sessionType'), prescription.session.sessionType],
    [t('offer.workout.field.objective'), prescription.session.objective],
    [t('offer.workout.field.phase'), prescription.session.periodizationPhase],
    [t('offer.workout.field.duration'), prescription.session.estimatedDuration],
    [t('offer.workout.field.volume'), prescription.session.totalVolume],
    [t('offer.workout.field.intensityModel'), prescription.session.intensityModel],
    [t('offer.workout.field.environment'), prescription.session.environment],
    [t('offer.workout.field.equipment'), prescription.session.equipment],
  ].filter((detail) => detail[1]);
  return (
    <BottomSheet open onClose={onClose} title={workout.title} description={t(WORKOUT_TYPE_KEYS_FOR_SHEET[workout.trainingType])} panelClassName="max-h-[88%]">
      <div className="space-y-5 px-5 pb-8">
        {sessionDetails.length > 0 && <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-container p-4">{sessionDetails.map(([label, value]) => <div key={label}><dt className="font-sans text-counter text-on-surface-variant">{label}</dt><dd className="mt-1 font-sans text-body text-on-surface">{value}</dd></div>)}</dl>}
        <section><h3 className="font-sans text-label text-on-surface">{t('offer.workout.specific.title', { type: t(WORKOUT_TYPE_KEYS_FOR_SHEET[workout.trainingType]) })}</h3><dl className="mt-2 space-y-2">{SPECIFIC_FIELDS[workout.trainingType].flatMap((field) => prescription.specifics[field.key] ? [<div key={field.key} className="flex items-start justify-between gap-4 border-b border-outline-variant/20 py-2"><dt className="font-sans text-body-sm text-on-surface-variant">{t(field.label)}</dt><dd className="text-right font-sans text-body text-on-surface">{prescription.specifics[field.key]}</dd></div>] : [])}</dl></section>
        <section><h3 className="font-sans text-label text-on-surface">{t('offer.workout.blocks.title')}</h3><ol className="mt-2 space-y-3">{prescription.blocks.map((block, index) => <li key={block.id} className="rounded-xl bg-surface-container p-4"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 font-sans text-counter text-primary">{index + 1}</span><p className="font-sans text-label text-on-surface">{block.name || t(BLOCK_ROLE_KEYS[block.role])}</p></div><p className="mt-3 font-sans text-body text-on-surface">{block.task}</p><p className="mt-2 font-sans text-body-sm text-on-surface-variant">{[block.series && `${block.series} ${t('offer.workout.block.series')}`, block.repetitions && `${block.repetitions} ${t('offer.workout.block.repetitions')}`, block.distance, block.duration, block.intensityTarget, block.recoveryDuration && `${t('offer.workout.block.recoveryDuration')}: ${block.recoveryDuration}`].filter(Boolean).join(' · ')}</p>{block.technique && <p className="mt-2 border-t border-outline-variant/20 pt-2 font-sans text-body-sm text-on-surface">{block.technique}</p>}</li>)}</ol></section>
        {prescription.session.interruptionCriteria && <section className="rounded-xl bg-error-container p-4"><h3 className="font-sans text-label text-on-error-container">{t('offer.workout.field.interruption')}</h3><p className="mt-1 font-sans text-body-sm text-on-error-container">{prescription.session.interruptionCriteria}</p></section>}
      </div>
    </BottomSheet>
  );
}

const WORKOUT_TYPE_KEYS_FOR_SHEET: Record<WorkoutTrainingType, TranslationKey> = surfaceTranslationKey;

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
        <div className="min-w-0">
          <h2 className="font-sans text-title-lg text-on-surface">{t('meufit.training.tabs.history')}</h2>
          <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.history.subtitle')}</p>
        </div>
        <button type="button" onClick={onRecord} className="flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-primary px-4 font-sans text-counter text-on-primary transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label={t('meufit.training.history.record')}>
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

function HistoryRow({ title, meta, status, surface, importedFromWatch, activity, onOpenActivity }: HistoryEntry & { onOpenActivity: (activity: ImportedActivity) => void }) {
  const { t } = useTranslation();
  const content = (
    <>
      <TrainingBadge surface={surface} status={status} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 break-words font-sans text-label leading-snug text-on-surface">{title}</span>
          {importedFromWatch ? <WatchOriginChip /> : null}
        </span>
        <span className="mt-0.5 block break-words font-sans text-body-sm leading-snug text-on-surface-variant">{meta}</span>
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
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
        completed && 'border-primary/35 bg-primary/10 text-primary',
        missed && 'border-error/35 bg-error/10 text-error',
        !completed && !missed && 'border-outline-variant/40 bg-surface-container-high text-on-surface-variant',
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
