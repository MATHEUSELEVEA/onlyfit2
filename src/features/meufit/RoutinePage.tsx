import { useMemo, useState } from 'react';
import { ArrowLeft, Bell, Check, Clock3, Droplets, Plus, X } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useTranslation } from '@/i18n/I18nProvider';

type RoutineKind = 'water' | 'reminder';
type TimingMode = 'specific' | 'interval';

interface Routine {
  id: number;
  kind: RoutineKind;
  title: string;
  goalMl?: number;
  times: string[];
  notifications: boolean;
  checked: string[];
  waterPlan?: Record<string, number>;
  waterConsumed?: Record<string, number>;
}

interface TimeSlot {
  id: number;
  value: string;
}

function nextSlotId(times: TimeSlot[]): number {
  return times.reduce((highest, slot) => Math.max(highest, slot.id), 0) + 1;
}

function intervalTimes(start: string, end: string, everyHours: number): string[] {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const from = startHour * 60 + startMinute;
  const to = endHour * 60 + endMinute;
  if (to < from) return [start];
  const values: string[] = [];
  for (let current = from; current <= to; current += everyHours * 60) {
    values.push(`${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`);
  }
  return values;
}

function defaultWaterAmount(goalMl: number, count: number): number {
  return Math.max(50, Math.round(goalMl / Math.max(count, 1) / 50) * 50);
}

export function RoutinePage() {
  const { t } = useTranslation();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = useMemo(() => routines.find((routine) => routine.id === selectedId) ?? null, [routines, selectedId]);

  function toggleCheck(routineId: number, time: string) {
    setRoutines((current) => current.map((routine) => {
      if (routine.id !== routineId) return routine;
      return { ...routine, checked: routine.checked.includes(time) ? routine.checked.filter((item) => item !== time) : [...routine.checked, time] };
    }));
  }

  function updateWaterConsumed(routineId: number, time: string, amount: number) {
    setRoutines((current) => current.map((routine) => {
      if (routine.id !== routineId) return routine;
      return { ...routine, waterConsumed: { ...routine.waterConsumed, [time]: Math.max(0, amount) } };
    }));
  }

  return (
    <>
      <div className="h-full overflow-y-auto bg-background pb-10">
        <PageTopBar title={t('meufit.routine.title')} backFallback="/meu-fit" />
        <div className="mx-auto w-full max-w-[720px] px-6 pt-6">
          {routines.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
              <Clock3 size={40} className="text-primary" aria-hidden />
              <h2 className="mt-4 font-sans text-title text-on-surface">{t('meufit.routine.emptyTitle')}</h2>
              <p className="mt-1 max-w-xs font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.emptyDescription')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {routines.map((routine) => (
                <button key={routine.id} type="button" onClick={() => setSelectedId(routine.id)} className="flex min-h-[152px] flex-col items-start justify-between rounded-2xl border border-outline-variant/40 bg-surface-container p-4 text-left transition-transform active:scale-[0.97]">
                  {routine.kind === 'water' ? <Droplets size={32} className="text-primary" aria-hidden /> : <Bell size={32} className="text-primary" aria-hidden />}
                  <span>
                    <span className="block font-sans text-label text-on-surface">{routine.title}</span>
                    <span className="mt-1 block font-sans text-body-sm text-on-surface-variant">{routine.kind === 'water' ? `${Object.values(routine.waterConsumed ?? {}).reduce((sum, amount) => sum + amount, 0)} / ${routine.goalMl} ml` : `${routine.checked.length}/${routine.times.length} ${t('meufit.routine.done')}`}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setWizardOpen(true)} className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-primary font-sans text-label text-on-primary active:opacity-90">
            <Plus size={20} aria-hidden /> {t('meufit.routine.create')}
          </button>
        </div>
      </div>

      {wizardOpen && <RoutineWizard nextId={routines.length + 1} onClose={() => setWizardOpen(false)} onCreate={(routine) => { setRoutines((current) => [...current, routine]); setWizardOpen(false); }} />}

      <BottomSheet open={Boolean(selected)} onClose={() => setSelectedId(null)} title={selected?.title ?? ''}>
      {selected && <RoutineDetail routine={selected} onToggle={toggleCheck} onWaterChange={updateWaterConsumed} />}
      </BottomSheet>
    </>
  );
}

function RoutineWizard({ nextId, onClose, onCreate }: { nextId: number; onClose: () => void; onCreate: (routine: Routine) => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<RoutineKind | null>(null);
  const [goalMl, setGoalMl] = useState(2000);
  const [name, setName] = useState('');
  const [timingMode, setTimingMode] = useState<TimingMode>('specific');
  const [times, setTimes] = useState<TimeSlot[]>([{ id: 1, value: '08:00' }]);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('20:00');
  const [everyHours, setEveryHours] = useState(2);
  const [notifications, setNotifications] = useState(true);
  const [waterPlan, setWaterPlan] = useState<Record<string, number>>({});

  const schedule = timingMode === 'specific' ? times.map((slot) => slot.value) : intervalTimes(start, end, everyHours);
  const canContinue = step === 1 ? Boolean(kind) : step !== 2 || kind === 'water' || Boolean(name.trim());

  function create() {
    if (!kind) return;
    onCreate({
      id: nextId,
      kind,
      title: kind === 'water' ? t('meufit.routine.waterTitle') : name.trim(),
      goalMl: kind === 'water' ? goalMl : undefined,
      times: schedule,
      notifications,
      checked: [],
      waterPlan: kind === 'water' ? Object.fromEntries(schedule.map((time) => [time, waterPlan[time] ?? defaultWaterAmount(goalMl, schedule.length)])) : undefined,
      waterConsumed: kind === 'water' ? {} : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-[var(--z-sheet)] flex h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-outline-variant/30 px-4 pb-4 pt-safe-top">
        <button type="button" onClick={step === 1 ? onClose : () => setStep((current) => current - 1)} aria-label={step === 1 ? t('meufit.routine.close') : t('meufit.routine.back')} className="flex h-11 w-11 items-center justify-center text-on-surface"><ArrowLeft size={22} aria-hidden /></button>
        <span className="font-sans text-label text-on-surface-variant">{step} {t('meufit.routine.of')} 4</span>
        <button type="button" onClick={onClose} aria-label={t('meufit.routine.close')} className="flex h-11 w-11 items-center justify-center text-on-surface"><X size={22} aria-hidden /></button>
      </header>
      <div className="h-0.5 bg-surface-container-high"><span className="block h-full bg-primary transition-all" style={{ width: `${step * 25}%` }} /></div>

      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-6 py-8">
        {step === 1 && (
          <section>
            <p className="font-sans text-title-lg text-on-surface">{t('meufit.routine.step1Title')}</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.step1Description')}</p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <WizardChoice active={kind === 'water'} icon={Droplets} title={t('meufit.routine.waterTitle')} description={t('meufit.routine.waterDescription')} onClick={() => setKind('water')} />
              <WizardChoice active={kind === 'reminder'} icon={Bell} title={t('meufit.routine.reminderTitle')} description={t('meufit.routine.reminderDescription')} onClick={() => setKind('reminder')} />
            </div>
          </section>
        )}

        {step === 2 && kind === 'water' && (
          <section className="text-center">
            <p className="font-sans text-title-lg text-on-surface">{t('meufit.routine.waterGoalQuestion')}</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.waterGoalDescription')}</p>
            <div className="mt-12 flex items-center justify-center gap-6">
              <GoalButton label="−" onClick={() => setGoalMl((value) => Math.max(250, value - 250))} />
              <span className="font-sans text-display text-primary">{(goalMl / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L</span>
              <GoalButton label="+" onClick={() => setGoalMl((value) => value + 250)} />
            </div>
          </section>
        )}

        {step === 2 && kind === 'reminder' && (
          <section>
            <p className="font-sans text-title-lg text-on-surface">{t('meufit.routine.reminderQuestion')}</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.reminderQuestionDescription')}</p>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('meufit.routine.reminderPlaceholder')} autoFocus className="mt-8 min-h-[56px] w-full border-b border-outline bg-transparent px-1 font-sans text-title text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none" />
            <div className="mt-5 flex flex-wrap gap-2">
              {[t('meufit.routine.suggestionVitamin'), t('meufit.routine.suggestionMedicine'), t('meufit.routine.suggestionMeal'), t('meufit.routine.suggestionShake')].map((suggestion) => <button key={suggestion} type="button" onClick={() => setName(suggestion)} className="min-h-[36px] rounded-full border border-outline-variant/50 px-3 font-sans text-counter text-on-surface-variant">{suggestion}</button>)}
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <p className="font-sans text-title-lg text-on-surface">{t('meufit.routine.timingTitle')}</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.timingDescription')}</p>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <TimingChoice active={timingMode === 'specific'} title={t('meufit.routine.specificTimes')} description={t('meufit.routine.specificTimesDescription')} onClick={() => setTimingMode('specific')} />
              <TimingChoice active={timingMode === 'interval'} title={t('meufit.routine.interval')} description={t('meufit.routine.intervalDescription')} onClick={() => setTimingMode('interval')} />
            </div>
            {timingMode === 'specific' ? <SpecificTimes times={times} onChange={setTimes} /> : <IntervalTimes start={start} end={end} everyHours={everyHours} onStart={setStart} onEnd={setEnd} onEvery={setEveryHours} />}
            {kind === 'water' && <WaterDistribution schedule={schedule} goalMl={goalMl} plan={waterPlan} onChange={setWaterPlan} />}
          </section>
        )}

        {step === 4 && (
          <section>
            <p className="font-sans text-title-lg text-on-surface">{t('meufit.routine.reviewTitle')}</p>
            <div className="mt-7 overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container">
              <div className="p-4">
                <p className="font-sans text-title text-on-surface">{kind === 'water' ? t('meufit.routine.waterTitle') : name}</p>
                <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{kind === 'water' ? `${(goalMl / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L` : schedule.join(' · ')}</p>
              </div>
              <button type="button" onClick={() => setNotifications((value) => !value)} className="flex min-h-[64px] w-full items-center gap-3 border-t border-outline-variant/25 px-4 text-left">
                <Bell size={20} className="text-primary" aria-hidden />
                <span className="flex-1"><span className="block font-sans text-body text-on-surface">{t('meufit.routine.notifications')}</span><span className="block font-sans text-body-sm text-on-surface-variant">{notifications ? t('meufit.routine.notificationsOn') : t('meufit.routine.notificationsOff')}</span></span>
                <span className={clsx('relative h-6 w-11 rounded-full transition-colors', notifications ? 'bg-primary' : 'bg-surface-container-highest')}><span className={clsx('absolute left-1 top-1 h-4 w-4 rounded-full bg-surface-container-lowest transition-transform', notifications && 'translate-x-5')} /></span>
              </button>
            </div>
            <p className="mt-4 font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.notificationHint')}</p>
          </section>
        )}
      </main>
      <footer className="border-t border-outline-variant/30 px-6 pb-safe-bottom pt-3">
        <button type="button" disabled={!canContinue} onClick={() => step === 4 ? create() : setStep((current) => current + 1)} className="mb-3 min-h-[52px] w-full rounded-lg bg-primary font-sans text-label text-on-primary transition-opacity disabled:opacity-40">
          {step === 4 ? t('meufit.routine.confirm') : t('meufit.routine.continue')}
        </button>
      </footer>
    </div>
  );
}

function WizardChoice({ active, icon: Icon, title, description, onClick }: { active: boolean; icon: typeof Droplets; title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={clsx('flex min-h-[180px] flex-col items-start rounded-2xl border p-4 text-left', active ? 'border-primary bg-primary/10' : 'border-outline-variant/40 bg-surface-container')}><Icon size={32} className="text-primary" aria-hidden /><span className="mt-auto font-sans text-label text-on-surface">{title}</span><span className="mt-1 font-sans text-body-sm text-on-surface-variant">{description}</span></button>;
}

function TimingChoice({ active, title, description, onClick }: { active: boolean; title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={clsx('min-h-[116px] rounded-xl border p-4 text-left', active ? 'border-primary bg-primary/10' : 'border-outline-variant/40 bg-surface-container')}><span className="font-sans text-label text-on-surface">{title}</span><span className="mt-1 block font-sans text-body-sm text-on-surface-variant">{description}</span></button>;
}

function GoalButton({ label, onClick }: { label: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="flex h-12 w-12 items-center justify-center rounded-full border border-outline-variant/50 font-sans text-title text-on-surface">{label}</button>; }

function SpecificTimes({ times, onChange }: { times: TimeSlot[]; onChange: (times: TimeSlot[]) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-7">
      <span className="font-sans text-label text-on-surface">{t('meufit.routine.times')}</span>
      <div className="mt-3 space-y-2">
        {times.map((slot, index) => (
          <div key={slot.id} className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container p-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 font-sans text-counter text-primary">{index + 1}</span>
            <input
              type="time"
              value={slot.value}
              onChange={(event) => onChange(times.map((item) => item.id === slot.id ? { ...item, value: event.target.value } : item))}
              className="min-h-[40px] min-w-0 flex-1 bg-transparent font-sans text-body text-on-surface focus:outline-none"
            />
            {times.length > 1 && (
              <button type="button" onClick={() => onChange(times.filter((item) => item.id !== slot.id))} aria-label={t('meufit.routine.removeTime')} className="flex h-10 w-10 items-center justify-center text-on-surface-variant">
                <X size={18} aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...times, { id: nextSlotId(times), value: suggestedTime(times.map((slot) => slot.value)) }])} className="mt-3 flex min-h-[44px] items-center gap-2 rounded-lg border border-dashed border-outline-variant/60 px-3 font-sans text-label text-primary">
        <Plus size={18} aria-hidden />
        {t('meufit.routine.addTime')}
      </button>
    </div>
  );
}

function IntervalTimes({ start, end, everyHours, onStart, onEnd, onEvery }: { start: string; end: string; everyHours: number; onStart: (value: string) => void; onEnd: (value: string) => void; onEvery: (value: number) => void }) {
  const { t } = useTranslation();
  const preview = intervalTimes(start, end, everyHours);
  return (
    <div className="mt-7 space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <label className="font-sans text-label text-on-surface">{t('meufit.routine.from')}<input type="time" value={start} onChange={(event) => onStart(event.target.value)} className="mt-2 min-h-[48px] w-full rounded-lg border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface" /></label>
        <label className="font-sans text-label text-on-surface">{t('meufit.routine.until')}<input type="time" value={end} onChange={(event) => onEnd(event.target.value)} className="mt-2 min-h-[48px] w-full rounded-lg border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface" /></label>
      </div>
      <div>
        <span className="font-sans text-label text-on-surface">{t('meufit.routine.every')}</span>
        <div className="mt-2 flex gap-2">{[1, 2, 3, 4].map((hours) => <button key={hours} type="button" onClick={() => onEvery(hours)} className={clsx('min-h-[40px] rounded-full border px-3 font-sans text-label', everyHours === hours ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/50 text-on-surface-variant')}>{hours}h</button>)}</div>
      </div>
      <div className="rounded-xl bg-surface-container p-4">
        <span className="font-sans text-counter text-on-surface-variant">{t('meufit.routine.schedulePreview')}</span>
        <div className="mt-2 flex flex-wrap gap-2">{preview.slice(0, 6).map((time) => <span key={time} className="rounded-full bg-primary/10 px-3 py-1 font-sans text-counter text-primary">{time}</span>)}{preview.length > 6 && <span className="rounded-full bg-surface-container-high px-3 py-1 font-sans text-counter text-on-surface-variant">+{preview.length - 6}</span>}</div>
      </div>
    </div>
  );
}

function WaterDistribution({ schedule, goalMl, plan, onChange }: { schedule: string[]; goalMl: number; plan: Record<string, number>; onChange: (plan: Record<string, number>) => void }) {
  const { t } = useTranslation();
  const total = schedule.reduce((sum, time) => sum + (plan[time] ?? defaultWaterAmount(goalMl, schedule.length)), 0);
  function amountFor(time: string) { return plan[time] ?? defaultWaterAmount(goalMl, schedule.length); }
  function update(time: string, amount: number) { onChange({ ...plan, [time]: Math.max(50, Math.round(amount / 50) * 50) }); }

  return (
    <div className="mt-7">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans text-label text-on-surface">{t('meufit.routine.waterDistribution')}</span>
        <span className={clsx('font-sans text-counter', total === goalMl ? 'text-primary' : 'text-on-surface-variant')}>{total} / {goalMl} ml</span>
      </div>
      <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.waterDistributionHint')}</p>
      <div className="mt-3 space-y-2">
        {schedule.map((time) => (
          <div key={time} className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container p-2">
            <span className="w-12 font-sans text-label text-on-surface">{time}</span>
            <button type="button" onClick={() => update(time, amountFor(time) - 50)} aria-label={t('meufit.routine.decreaseAmount')} className="flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant"><span className="text-title">−</span></button>
            <span className="min-w-0 flex-1 text-center font-sans text-label text-on-surface">{amountFor(time)} ml</span>
            <button type="button" onClick={() => update(time, amountFor(time) + 50)} aria-label={t('meufit.routine.increaseAmount')} className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Plus size={18} aria-hidden /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function suggestedTime(times: string[]): string {
  const latest = [...times].sort().at(-1) ?? '08:00';
  const [hours, minutes] = latest.split(':').map(Number);
  return `${String((hours + 2) % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function RoutineDetail({ routine, onToggle, onWaterChange }: { routine: Routine; onToggle: (routineId: number, time: string) => void; onWaterChange: (routineId: number, time: string, amount: number) => void }) {
  const { t } = useTranslation();
  const consumed = Object.values(routine.waterConsumed ?? {}).reduce((sum, amount) => sum + amount, 0);
  const progress = routine.kind === 'water' && routine.goalMl ? Math.min(100, (consumed / routine.goalMl) * 100) : 0;
  return <div className="px-5 pb-6 pt-2">
    {routine.kind === 'water' && <div className="rounded-xl bg-primary/10 p-4"><p className="font-sans text-title text-on-surface">{consumed} / {routine.goalMl} ml</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-high"><span className="block h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div></div>}
    <ul className="mt-4 overflow-hidden rounded-xl border border-outline-variant/40 bg-surface">
      {routine.times.map((time) => {
        const done = routine.checked.includes(time);
        const planned = routine.waterPlan?.[time];
        const amount = routine.waterConsumed?.[time] ?? 0;
        return <li key={time} className="border-t border-outline-variant/25 px-4 py-3 first:border-t-0">
          {routine.kind === 'water' ? <div className="flex items-center gap-3"><span className="w-11 font-sans text-body text-on-surface">{time}</span><span className="flex-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.planned')} {planned ?? 0} ml</span><label className="flex items-center gap-1 rounded-lg bg-surface-container px-2 py-1"><input type="number" inputMode="numeric" min="0" step="50" value={amount || ''} onChange={(event) => onWaterChange(routine.id, time, Number(event.target.value))} aria-label={`${t('meufit.routine.consumed')} ${time}`} className="w-12 bg-transparent text-right font-sans text-label text-on-surface focus:outline-none" /><span className="font-sans text-counter text-on-surface-variant">ml</span></label></div> : <div className="flex min-h-[36px] items-center gap-3"><button type="button" onClick={() => onToggle(routine.id, time)} aria-pressed={done} className={clsx('flex h-8 w-8 items-center justify-center rounded-full', done ? 'bg-primary text-on-primary' : 'border border-outline text-on-surface-variant')}>{done && <Check size={18} aria-hidden />}</button><span className="font-sans text-body text-on-surface">{time}</span></div>}
        </li>;
      })}
    </ul>
  </div>;
}
