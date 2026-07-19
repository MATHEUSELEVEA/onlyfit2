import { useMemo, useState, type ReactNode } from 'react';
import { Activity, Bike, CalendarDays, ChevronLeft, ChevronRight, Dumbbell, Flame, Footprints, HeartPulse, Leaf, Play, Plus, Radio, RotateCcw, Waves, Watch } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { type ActivitySource, type ImportedActivity, type ScheduledWorkout, type TrainingStatus, type TrainingSurface, useTraining } from '@/features/training/TrainingProvider';
import { useAppleHealth } from '@/features/wearables/useAppleHealth';
import { useTranslation } from '@/i18n/I18nProvider';

type Tab = 'agenda' | 'history' | 'progress';
type AppleHealthState = ReturnType<typeof useAppleHealth>;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const today = () => dateKey(new Date());
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

function formatActivityMeta(activity: { durationMin: number; source: string; distanceKm?: number; calories?: number; averageHeartRate?: number; elevationM?: number }) {
  return [
    `${activity.durationMin} min`,
    activity.distanceKm ? `${activity.distanceKm.toLocaleString('pt-BR')} km` : null,
    activity.calories ? `${activity.calories} kcal` : null,
    activity.averageHeartRate ? `${activity.averageHeartRate} bpm` : null,
    activity.elevationM ? `${activity.elevationM} m alt.` : null,
    sourceLabel(activity.source),
  ].filter(Boolean).join(' · ');
}

export function TrainingPage() { return <TrainingContent />; }

function TrainingContent() {
  const [tab, setTab] = useState<Tab>('agenda'); const [selectedDate, setSelectedDate] = useState(today()); const [calendarOpen, setCalendarOpen] = useState(false); const [recordOpen, setRecordOpen] = useState(false);
  const { scheduled, imported, activeSession, addActivity } = useTraining();
  const appleHealth = useAppleHealth();
  const allImported = useMemo<ImportedActivity[]>(() => [...appleHealth.importedActivities, ...imported], [appleHealth.importedActivities, imported]);
  const selectedItems = scheduled.filter((item) => item.date === selectedDate);
  const selectedImported = allImported.filter((item) => item.date === selectedDate);
  const activeItem = activeSession ? scheduled.find((item) => item.id === activeSession.scheduledId) : null;
  return <div className="relative flex h-full flex-col overflow-y-auto bg-background pb-8">
    <PageTopBar title="Treinos" backFallback="/meu-fit" actions={<button type="button" aria-label="Abrir calendário mensal" onClick={() => setCalendarOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container text-on-surface"><CalendarDays size={20} aria-hidden /></button>} />
    <main className="mx-auto w-full max-w-[720px] px-5 pb-6 pt-5">
      <div className="grid grid-cols-3 rounded-xl bg-surface-container p-1" role="tablist" aria-label="Seções de treino">{([['agenda', 'Agenda'], ['history', 'Histórico'], ['progress', 'Progresso']] as [Tab, string][]).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={clsx('min-h-[40px] rounded-lg font-sans text-counter transition-colors', tab === value ? 'bg-surface-container-lowest text-on-surface' : 'text-on-surface-variant')}>{label}</button>)}</div>
      <AppleHealthCard appleHealth={appleHealth} compact={tab === 'agenda'} />
      {tab === 'agenda' && <Agenda selectedDate={selectedDate} onDate={setSelectedDate} items={selectedItems} imported={selectedImported} active={activeItem ?? null} onCalendar={() => setCalendarOpen(true)} />}
      {tab === 'history' && <History imported={allImported} />}
      {tab === 'progress' && <Progress appleHealth={appleHealth} />}
    </main>
    <button type="button" onClick={() => setRecordOpen(true)} className="absolute bottom-5 right-5 z-20 flex min-h-12 items-center gap-2 rounded-full border border-primary/40 bg-primary px-4 font-sans text-label text-on-primary shadow-lg shadow-black/20 active:scale-[0.98]" aria-label="Adicionar registro de atividade"><Plus size={18} aria-hidden />Registrar</button>
    <MonthlyCalendar open={calendarOpen} onClose={() => setCalendarOpen(false)} selectedDate={selectedDate} imported={allImported} onSelect={(value) => { setSelectedDate(value); setCalendarOpen(false); }} />
    <AddActivitySheet open={recordOpen} onClose={() => setRecordOpen(false)} selectedDate={selectedDate} onAdd={(activity) => { addActivity(activity); setRecordOpen(false); }} />
  </div>;
}

function Agenda({ selectedDate, onDate, items, imported, active, onCalendar }: { selectedDate: string; onDate: (value: string) => void; items: ScheduledWorkout[]; imported: { id: string; title: string; durationMin: number; surface: TrainingSurface; source: string; distanceKm?: number; calories?: number; averageHeartRate?: number; elevationM?: number }[]; active: ScheduledWorkout | null; onCalendar: () => void }) {
  const navigate = useNavigate(); const { startSession, activeSession, reschedule, scheduled } = useTraining(); const week = useMemo(() => Array.from({ length: 7 }, (_, index) => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + index); return d; }), []);
  const primary = active ?? items.find((item) => item.status === 'planned') ?? null;
  return <section className="mt-6 space-y-7">
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-container p-5"><span className="font-sans text-counter text-primary">{active ? 'TREINO EM ANDAMENTO' : selectedDate === today() ? 'HOJE' : 'AGENDA'}</span><h2 className="mt-2 font-sans text-title-lg text-on-surface">{primary ? primary.title : 'Nenhum treino programado'}</h2><p className="mt-1 font-sans text-body-sm text-on-surface-variant">{primary ? `${primary.focus} · ${primary.durationMin} min` : 'Seu profissional ainda não programou um treino para esta data.'}</p>{primary ? <button type="button" onClick={() => { startSession(primary.id); navigate('/meu-fit/treino/player'); }} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-sans text-label text-on-primary"><Play size={18} fill="currentColor" aria-hidden />{activeSession ? 'Continuar treino' : 'Começar treino'}</button> : null}</div>
    <section><div className="flex items-center justify-between"><h2 className="font-sans text-title text-on-surface">Esta semana</h2><button type="button" onClick={onCalendar} className="font-sans text-counter text-primary">Calendário</button></div><div className="mt-3 grid grid-cols-7 gap-1">{week.map((date) => { const value = dateKey(date); const selected = selectedDate === value; const item = scheduled.find((entry) => entry.date === value); return <button key={value} type="button" onClick={() => onDate(value)} aria-pressed={selected} className={clsx('flex min-h-[64px] flex-col items-center justify-center rounded-xl font-sans text-counter', selected ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant')}><span>{date.toLocaleDateString('pt-BR', { weekday: 'narrow' })}</span><span className="mt-1 text-body">{date.getDate()}</span>{item ? <span className={clsx('mt-1 h-1.5 w-1.5 rounded-full', selected ? 'bg-on-primary' : statusTone[item.status])} /> : null}</button>; })}</div></section>
    <section><h2 className="font-sans text-title text-on-surface">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}</h2><div className="mt-3 space-y-2">{items.length === 0 && imported.length === 0 ? <p className="rounded-xl border border-dashed border-outline-variant/50 px-4 py-5 font-sans text-body-sm text-on-surface-variant">Dia livre. Aguarde um treino enviado pelo seu profissional.</p> : null}{items.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface-container p-3"><TrainingBadge surface={item.surface} status={item.status} /><div className="min-w-0 flex-1"><p className="font-sans text-label text-on-surface">{item.title}</p><p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{statusLabel[item.status]} · {item.summary ?? `${item.durationMin} min`}</p></div>{item.status === 'planned' ? <button type="button" onClick={() => { startSession(item.id); navigate('/meu-fit/treino/player'); }} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary" aria-label={`Começar ${item.title}`}><Play size={16} fill="currentColor" aria-hidden /></button> : null}{item.status === 'missed' ? <button type="button" onClick={() => reschedule(item.id)} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-primary" aria-label={`Reagendar ${item.title}`}><RotateCcw size={16} aria-hidden /></button> : null}</div>)}{imported.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface p-3"><TrainingBadge surface={item.surface} status="imported" /><div><p className="font-sans text-label text-on-surface">{item.title}</p><p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{formatActivityMeta(item)}</p></div></div>)}</div></section>
  </section>;
}

function AppleHealthCard({ appleHealth, compact }: { appleHealth: AppleHealthState; compact?: boolean }) {
  const { t } = useTranslation();
  const connected = appleHealth.connection?.status === 'connected';
  const unavailable = !appleHealth.available && !appleHealth.isLoading;
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-sans text-label text-on-surface">{t('health.apple.title')}</h2>
              <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
                {unavailable
                  ? appleHealth.availabilityReason
                  : connected
                    ? `${t('health.apple.connected')}${lastSync ? ` · ${lastSync}` : ''}`
                    : t('health.apple.description')}
              </p>
            </div>
            {connected ? (
              <button
                type="button"
                onClick={() => appleHealth.sync.mutate('manual')}
                disabled={syncing}
                className="min-h-10 shrink-0 rounded-full bg-primary px-4 font-sans text-counter text-on-primary disabled:opacity-60"
              >
                {syncing ? t('health.apple.syncing') : t('health.apple.sync')}
              </button>
            ) : null}
          </div>

          {!connected && !unavailable ? (
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
                className="min-h-12 w-full rounded-xl bg-primary font-sans text-label text-on-primary disabled:opacity-60"
              >
                {syncing ? t('health.apple.connecting') : t('health.apple.connect')}
              </button>
            </div>
          ) : null}

          {appleHealth.lastSyncMessage ? <p className="mt-3 font-sans text-counter text-primary">{appleHealth.lastSyncMessage}</p> : null}
          {error ? <p className="mt-3 font-sans text-body-sm text-error">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}

function History({ imported }: { imported: ImportedActivity[] }) { const { scheduled } = useTraining(); const entries = [...scheduled.filter((item) => ['completed', 'partial', 'missed'].includes(item.status)).map((item) => ({ id: item.id, date: item.date, title: item.title, meta: item.summary ?? `${item.durationMin} min · ${statusLabel[item.status].toLowerCase()}`, status: item.status, surface: item.surface })), ...imported.map((item) => ({ id: item.id, date: item.date, title: item.title, meta: formatActivityMeta(item), status: 'imported' as TrainingStatus, surface: item.surface }))].sort((a, b) => b.date.localeCompare(a.date)); return <section className="mt-6"><h2 className="font-sans text-title text-on-surface">Histórico</h2><p className="mt-1 font-sans text-body-sm text-on-surface-variant">Treinos e atividades registrados.</p><div className="mt-4 space-y-2">{entries.length ? entries.map((item) => <HistoryRow key={item.id} {...item} />) : <p className="rounded-xl border border-dashed border-outline-variant/50 px-4 py-5 font-sans text-body-sm text-on-surface-variant">Sem atividades registradas ainda.</p>}</div></section>; }
function HistoryRow({ date, title, meta, status, surface }: { date: string; title: string; meta: string; status: TrainingStatus; surface: TrainingSurface }) { return <div className="flex items-start gap-3 rounded-xl border border-outline-variant/40 bg-surface-container p-3"><TrainingBadge surface={surface} status={status} /><div className="min-w-0 flex-1"><p className="break-words font-sans text-label leading-snug text-on-surface">{title}</p><p className="mt-0.5 break-words font-sans text-body-sm leading-snug text-on-surface-variant">{new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {meta}</p></div></div>; }
function Progress({ appleHealth }: { appleHealth: AppleHealthState }) { const { scheduled } = useTraining(); const completed = scheduled.filter((item) => item.status === 'completed').length; const sleep = appleHealth.progress.avgSleepMinutes ? `${Math.floor(appleHealth.progress.avgSleepMinutes / 60)}h${String(appleHealth.progress.avgSleepMinutes % 60).padStart(2, '0')}` : '—'; return <section className="mt-6"><h2 className="font-sans text-title text-on-surface">Progresso</h2><p className="mt-1 font-sans text-body-sm text-on-surface-variant">Leitura simples da sua consistência com dados importados quando existirem.</p><div className="mt-5 grid grid-cols-2 gap-3"><Metric icon="✓" value={`${completed}`} label="treinos concluídos" /><Metric icon="↯" value={appleHealth.progress.activeKcal ? `${Math.round(appleHealth.progress.activeKcal)} kcal` : '—'} label="calorias ativas" /><Metric icon="⌁" value={appleHealth.progress.steps ? appleHealth.progress.steps.toLocaleString('pt-BR') : '—'} label="passos em 30 dias" /><Metric icon="☾" value={sleep} label="sono médio" /></div><div className="mt-5 rounded-2xl border border-outline-variant/40 bg-surface-container p-4"><div className="flex items-center gap-2 text-primary"><Watch size={18} aria-hidden /><span className="font-sans text-label">Fonte Apple Health</span></div><p className="mt-4 font-sans text-title-lg text-on-surface">{appleHealth.importedActivities.length}</p><p className="mt-1 font-sans text-body-sm text-on-surface-variant">atividades importadas do iPhone/Apple Watch.</p></div></section>; }
function Metric({ icon, value, label }: { icon: string; value: string; label: string }) { return <div className="rounded-2xl border border-outline-variant/40 bg-surface-container p-4"><span className="font-sans text-label text-primary">{icon}</span><p className="mt-3 font-sans text-title text-on-surface">{value}</p><p className="mt-1 font-sans text-body-sm text-on-surface-variant">{label}</p></div>; }
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
function MonthlyCalendar({ open, onClose, selectedDate, imported, onSelect }: { open: boolean; onClose: () => void; selectedDate: string; imported: ImportedActivity[]; onSelect: (value: string) => void }) {
  const { scheduled } = useTraining();
  const [cursor, setCursor] = useState(() => new Date(`${selectedDate}T12:00:00`));
  const year = cursor.getFullYear(); const month = cursor.getMonth(); const firstDay = new Date(year, month, 1).getDay();
  const days = Array.from({ length: firstDay + new Date(year, month + 1, 0).getDate() }, (_, index) => index < firstDay ? null : new Date(year, month, index - firstDay + 1));
  return <BottomSheet open={open} onClose={onClose} title="Calendário" description="Toque em um dia para ver seus treinos." panelClassName="max-h-[92%]">
    <div className="px-5 pb-6"><div className="flex items-center justify-between"><button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} className="flex h-11 w-11 items-center justify-center text-on-surface" aria-label="Mês anterior"><ChevronLeft size={20} /></button><span className="font-sans text-label text-on-surface">{cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span><button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} className="flex h-11 w-11 items-center justify-center text-on-surface" aria-label="Próximo mês"><ChevronRight size={20} /></button></div>
      <div className="mt-4 grid grid-cols-7 text-center font-sans text-counter text-on-surface-variant">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((name, index) => <span key={`${name}-${index}`} className="py-2">{name}</span>)}{days.map((date, index) => { if (!date) return <span key={`blank-${index}`} />; const value = dateKey(date); const item = scheduled.find((entry) => entry.date === value); const importedItem = imported.find((entry) => entry.date === value); const marker = item ? statusLabel[item.status] : importedItem ? 'atividade importada' : ''; return <button key={value} type="button" onClick={() => onSelect(value)} className={clsx('mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full font-sans text-counter', value === selectedDate ? 'bg-primary text-on-primary' : 'text-on-surface')} aria-label={`${date.toLocaleDateString('pt-BR')}${marker ? `, ${marker}` : ''}`}><span>{date.getDate()}</span>{(item || importedItem) ? <span className={clsx('mt-0.5 h-1 w-1 rounded-full', value === selectedDate ? 'bg-on-primary' : item ? statusTone[item.status] : 'bg-tertiary')} /> : null}</button>; })}</div>
      <button type="button" onClick={() => { setCursor(new Date()); onSelect(today()); }} className="mt-5 min-h-11 font-sans text-label text-primary">Ir para hoje</button>
    </div>
  </BottomSheet>;
}

const surfaces: { value: TrainingSurface; label: string; icon: ReactNode }[] = [
  { value: 'strength', label: 'Musculação', icon: <Dumbbell size={18} /> },
  { value: 'running', label: 'Corrida', icon: <Activity size={18} /> },
  { value: 'cycling', label: 'Bike', icon: <Bike size={18} /> },
  { value: 'walking', label: 'Caminhada', icon: <Footprints size={18} /> },
  { value: 'hiit', label: 'HIIT', icon: <Flame size={18} /> },
  { value: 'other', label: 'Outro', icon: <Plus size={18} /> },
];

const importSources: { value: ActivitySource; label: string; icon: ReactNode }[] = [
  { value: 'apple_health', label: 'Apple Health', icon: <Watch size={18} /> },
  { value: 'garmin', label: 'Garmin', icon: <Radio size={18} /> },
  { value: 'strava', label: 'Strava', icon: <Activity size={18} /> },
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
  const [mode, setMode] = useState<'manual' | 'import'>('manual');
  const [surface, setSurface] = useState<TrainingSurface>('strength');
  const [duration, setDuration] = useState(55);
  const [distance, setDistance] = useState('5,0');
  const [calories, setCalories] = useState('420');
  const [averageHeartRate, setAverageHeartRate] = useState('145');
  const [elevation, setElevation] = useState('');
  const [source, setSource] = useState<ActivitySource>('apple_health');

  const selectedSurface = surfaces.find((item) => item.value === surface) ?? surfaces[0];
  const selectedSource = importSources.find((item) => item.value === source) ?? importSources[0];
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
      title: selectedSurface.value === 'strength' ? 'Musculação registrada' : `${selectedSurface.label} registrada`,
      durationMin: duration,
      surface,
      source: 'manual',
      ...activityMetrics,
    });
  };

  const addImportedMock = () => {
    onAdd({
      date: selectedDate,
      title: `${selectedSurface.label} importada`,
      durationMin: duration,
      surface,
      source,
      ...activityMetrics,
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Adicionar registro"
      description="Atividade feita fora do Player. Não cria prescrição de treino."
      panelClassName="max-h-[92%]"
    >
      <div className="space-y-5 px-5 pb-6">
        <div className="grid grid-cols-2 rounded-xl bg-surface-container p-1" role="tablist" aria-label="Tipo de registro">
          {([
            ['manual', 'Manual'],
            ['import', 'Importar'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={clsx(
                'min-h-10 rounded-lg font-sans text-counter',
                mode === value ? 'bg-surface-container-lowest text-on-surface' : 'text-on-surface-variant',
              )}
            >
              {label}
            </button>
          ))}
        </div>

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
                    ? 'border-primary bg-primary text-on-primary shadow-[0_0_0_1px_rgba(188,255,0,0.22)]'
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

        {mode === 'import' ? (
          <div>
            <p className="font-sans text-label text-on-surface">Origem</p>
            <div className="mt-3 space-y-2">
              {importSources.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSource(item.value)}
                  className={clsx(
                    'flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 text-left font-sans text-label',
                    source === item.value
                      ? 'border-primary bg-primary text-on-primary'
                      : 'border-outline-variant/35 bg-surface-container text-on-surface',
                  )}
                >
                  <span className={source === item.value ? 'text-on-primary' : 'text-primary'}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
            <p className="mt-3 font-sans text-body-sm text-on-surface-variant">
              Integração real fica para HealthKit e conectores. Este mock já separa origem externa dos treinos OnlyFit.
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={mode === 'manual' ? addManual : addImportedMock}
          className="min-h-12 w-full rounded-xl bg-primary font-sans text-label text-on-primary"
        >
          {mode === 'manual' ? 'Salvar registro' : `Simular importação de ${selectedSource.label}`}
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
