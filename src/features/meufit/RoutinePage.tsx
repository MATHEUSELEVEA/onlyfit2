import { useMemo, useState } from 'react';
import { Check, Clock3, Droplets, Pill, Plus, Trash2, type LucideIcon } from 'lucide-react';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useTranslation } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/translations';

type RoutineType = 'water' | 'medicine';

interface RoutineTime {
  id: number;
  time: string;
  amountMl?: number;
  done: boolean;
}

interface WaterRoutine {
  id: number;
  type: 'water';
  title: string;
  goalMl: number;
  times: RoutineTime[];
}

interface MedicineRoutine {
  id: number;
  type: 'medicine';
  title: string;
  note: string;
  times: RoutineTime[];
}

type Routine = WaterRoutine | MedicineRoutine;

const ROUTINE_ICONS: Record<RoutineType, LucideIcon> = {
  water: Droplets,
  medicine: Pill,
};

function newTime(amountMl?: number): RoutineTime {
  return { id: Date.now() + Math.random(), time: '08:00', amountMl, done: false };
}

export function RoutinePage() {
  const { t } = useTranslation();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [type, setType] = useState<RoutineType | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [waterGoal, setWaterGoal] = useState('2000');
  const [waterTimes, setWaterTimes] = useState<RoutineTime[]>([newTime(250)]);
  const [medicineName, setMedicineName] = useState('');
  const [medicineNote, setMedicineNote] = useState('');
  const [medicineTimes, setMedicineTimes] = useState<RoutineTime[]>([newTime()]);

  const selectedRoutine = useMemo(
    () => routines.find((routine) => routine.id === selectedId) ?? null,
    [routines, selectedId],
  );

  function resetCreate() {
    setType(null);
    setWaterGoal('2000');
    setWaterTimes([newTime(250)]);
    setMedicineName('');
    setMedicineNote('');
    setMedicineTimes([newTime()]);
  }

  function closeCreate() {
    setCreateOpen(false);
    resetCreate();
  }

  function createRoutine() {
    if (type === 'water') {
      const goalMl = Number(waterGoal);
      if (!goalMl || waterTimes.length === 0) return;
      setRoutines((current) => [
        ...current,
        { id: Date.now(), type: 'water', title: t('meufit.routine.waterTitle'), goalMl, times: waterTimes },
      ]);
      closeCreate();
      return;
    }

    const title = medicineName.trim();
    if (type === 'medicine' && title && medicineTimes.length > 0) {
      setRoutines((current) => [
        ...current,
        { id: Date.now(), type: 'medicine', title, note: medicineNote.trim(), times: medicineTimes },
      ]);
      closeCreate();
    }
  }

  function toggleCheck(routineId: number, timeId: number) {
    setRoutines((current) =>
      current.map((routine) =>
        routine.id === routineId
          ? { ...routine, times: routine.times.map((item) => (item.id === timeId ? { ...item, done: !item.done } : item)) }
          : routine,
      ),
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <PageTopBar title={t('meufit.routine.title')} backFallback="/meu-fit" />
      <div className="mx-auto w-full max-w-[720px] px-6 pt-6">
        {routines.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
            <Clock3 size={40} className="text-primary" aria-hidden />
            <h2 className="mt-4 font-sans text-title text-on-surface">{t('meufit.routine.emptyTitle')}</h2>
            <p className="mt-1 max-w-xs font-sans text-body-sm text-on-surface-variant">
              {t('meufit.routine.emptyDescription')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {routines.map((routine) => {
              const Icon = ROUTINE_ICONS[routine.type];
              const completed = routine.times.filter((item) => item.done).length;
              return (
                <button
                  key={routine.id}
                  type="button"
                  onClick={() => setSelectedId(routine.id)}
                  className="flex min-h-[152px] flex-col items-start justify-between rounded-2xl border border-outline-variant/40 bg-surface-container p-4 text-left transition-transform active:scale-[0.97]"
                >
                  <Icon size={32} className="text-primary" aria-hidden />
                  <span>
                    <span className="block font-sans text-label text-on-surface">{routine.title}</span>
                    <span className="mt-1 block font-sans text-body-sm text-on-surface-variant">
                      {completed}/{routine.times.length} {t('meufit.routine.done')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-primary font-sans text-label text-on-primary transition-opacity active:opacity-90"
        >
          <Plus size={20} aria-hidden />
          {t('meufit.routine.create')}
        </button>
      </div>

      <BottomSheet open={createOpen} onClose={closeCreate} title={t('meufit.routine.create')}>
        <div className="space-y-5 px-5 pb-6 pt-2">
          {!type ? (
            <div className="grid grid-cols-2 gap-3">
              <RoutineTypeButton icon={Droplets} label={t('meufit.routine.waterTitle')} onClick={() => setType('water')} />
              <RoutineTypeButton icon={Pill} label={t('meufit.routine.medicineTitle')} onClick={() => setType('medicine')} />
            </div>
          ) : type === 'water' ? (
            <WaterRoutineForm
              goal={waterGoal}
              times={waterTimes}
              onGoalChange={setWaterGoal}
              onTimesChange={setWaterTimes}
              onSubmit={createRoutine}
              t={t}
            />
          ) : (
            <MedicineRoutineForm
              name={medicineName}
              note={medicineNote}
              times={medicineTimes}
              onNameChange={setMedicineName}
              onNoteChange={setMedicineNote}
              onTimesChange={setMedicineTimes}
              onSubmit={createRoutine}
              t={t}
            />
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        open={Boolean(selectedRoutine)}
        onClose={() => setSelectedId(null)}
        title={selectedRoutine?.title ?? ''}
      >
        {selectedRoutine && (
          <RoutineDetail routine={selectedRoutine} onToggle={toggleCheck} t={t} />
        )}
      </BottomSheet>
    </div>
  );
}

function RoutineTypeButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[132px] flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container font-sans text-label text-on-surface active:bg-surface-container-high">
      <Icon size={32} className="text-primary" aria-hidden />
      {label}
    </button>
  );
}

function WaterRoutineForm({ goal, times, onGoalChange, onTimesChange, onSubmit, t }: {
  goal: string;
  times: RoutineTime[];
  onGoalChange: (value: string) => void;
  onTimesChange: (times: RoutineTime[]) => void;
  onSubmit: () => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <label className="block">
        <span className="font-sans text-label text-on-surface">{t('meufit.routine.waterGoal')}</span>
        <input type="number" min="1" value={goal} onChange={(event) => onGoalChange(event.target.value)} className="mt-2 min-h-[48px] w-full rounded-lg border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" required />
      </label>
      <ScheduleEditor times={times} onChange={onTimesChange} water t={t} />
      <button type="submit" className="min-h-[48px] w-full rounded-lg bg-primary font-sans text-label text-on-primary">{t('meufit.routine.save')}</button>
    </form>
  );
}

function MedicineRoutineForm({ name, note, times, onNameChange, onNoteChange, onTimesChange, onSubmit, t }: {
  name: string;
  note: string;
  times: RoutineTime[];
  onNameChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onTimesChange: (times: RoutineTime[]) => void;
  onSubmit: () => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <label className="block">
        <span className="font-sans text-label text-on-surface">{t('meufit.routine.medicineName')}</span>
        <input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder={t('meufit.routine.medicinePlaceholder')} className="mt-2 min-h-[48px] w-full rounded-lg border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" required />
      </label>
      <ScheduleEditor times={times} onChange={onTimesChange} t={t} />
      <label className="block">
        <span className="font-sans text-label text-on-surface">{t('meufit.routine.note')}</span>
        <textarea value={note} onChange={(event) => onNoteChange(event.target.value)} className="mt-2 min-h-[88px] w-full resize-none rounded-lg border border-outline-variant/50 bg-surface p-3 font-sans text-body text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </label>
      <button type="submit" className="min-h-[48px] w-full rounded-lg bg-primary font-sans text-label text-on-primary">{t('meufit.routine.save')}</button>
    </form>
  );
}

function ScheduleEditor({ times, onChange, water = false, t }: {
  times: RoutineTime[];
  onChange: (times: RoutineTime[]) => void;
  water?: boolean;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div>
      <span className="font-sans text-label text-on-surface">{t('meufit.routine.times')}</span>
      <div className="mt-2 space-y-2">
        {times.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <input type="time" value={item.time} onChange={(event) => onChange(times.map((current) => current.id === item.id ? { ...current, time: event.target.value } : current))} className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface" />
            {water && <input type="number" min="1" value={item.amountMl ?? ''} onChange={(event) => onChange(times.map((current) => current.id === item.id ? { ...current, amountMl: Number(event.target.value) } : current))} aria-label={t('meufit.routine.waterAmount')} className="min-h-[44px] w-24 rounded-lg border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface" />}
            {times.length > 1 && <button type="button" onClick={() => onChange(times.filter((current) => current.id !== item.id))} aria-label={t('meufit.routine.removeTime')} className="flex h-11 w-11 items-center justify-center text-on-surface-variant"><Trash2 size={18} aria-hidden /></button>}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...times, newTime(water ? 250 : undefined)])} className="mt-3 min-h-[40px] font-sans text-label text-primary">+ {t('meufit.routine.addTime')}</button>
    </div>
  );
}

function RoutineDetail({ routine, onToggle, t }: { routine: Routine; onToggle: (routineId: number, timeId: number) => void; t: (key: TranslationKey) => string }) {
  const completed = routine.times.filter((item) => item.done);
  const waterProgress = routine.type === 'water' ? completed.reduce((total, item) => total + (item.amountMl ?? 0), 0) : 0;
  const percent = routine.type === 'water' ? Math.min(100, (waterProgress / routine.goalMl) * 100) : 0;

  return (
    <div className="px-5 pb-6 pt-2">
      {routine.type === 'water' ? (
        <div className="rounded-xl bg-primary/10 p-4">
          <p className="font-sans text-title text-on-surface">{waterProgress} / {routine.goalMl} ml</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-high">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : routine.note ? (
        <p className="rounded-xl bg-surface-container p-4 font-sans text-body-sm text-on-surface-variant">{routine.note}</p>
      ) : null}
      <ul className="mt-4 overflow-hidden rounded-xl border border-outline-variant/40 bg-surface">
        {routine.times.map((item) => (
          <li key={item.id} className="flex min-h-[60px] items-center gap-3 border-t border-outline-variant/25 px-4 first:border-t-0">
            <button type="button" onClick={() => onToggle(routine.id, item.id)} aria-pressed={item.done} aria-label={item.done ? t('meufit.routine.undo') : t('meufit.routine.check')} className={item.done ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary' : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-outline text-on-surface-variant'}>
              {item.done && <Check size={18} aria-hidden />}
            </button>
            <span className="font-sans text-body text-on-surface">{item.time}{routine.type === 'water' && item.amountMl ? ` · ${item.amountMl} ml` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
