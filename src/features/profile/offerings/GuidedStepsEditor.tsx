import { useMemo } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation, type TranslationKey } from '@/i18n/I18nProvider';
import type { WorkoutTrainingType } from '@/features/training/useStudentWorkouts';
import type { Effort, GuidedSingleStep, GuidedStep, StepRole, SwimStroke } from '@/features/training/guidedSession';

/**
 * Editor de passos guiados (esforço-primeiro, poucos campos). Cada linha vira um
 * passo executável; "repetir Nx" empacota num bloco repeat. O que o profissional
 * monta aqui é exatamente o que o aluno executa no player.
 */

const EFFORTS: Effort[] = ['easy', 'moderate', 'hard', 'max', 'recover'];
const ROLES: StepRole[] = ['warmup', 'main', 'recovery', 'cooldown'];
const PACE_SPORTS: WorkoutTrainingType[] = ['running', 'walking'];
const STROKES: SwimStroke[] = ['free', 'back', 'breast', 'fly', 'medley', 'choice'];

const STROKE_KEY: Record<SwimStroke, TranslationKey> = {
  free: 'meufit.training.guided.stroke.free',
  back: 'meufit.training.guided.stroke.back',
  breast: 'meufit.training.guided.stroke.breast',
  fly: 'meufit.training.guided.stroke.fly',
  medley: 'meufit.training.guided.stroke.medley',
  choice: 'meufit.training.guided.stroke.choice',
};

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

type BoundBy = 'time' | 'distance' | 'reps' | 'open';

interface EditorRow {
  id: string;
  role: StepRole;
  label: string;
  boundBy: BoundBy;
  min: string;
  sec: string;
  distance: string;
  distanceUnit: 'm' | 'km';
  reps: string;
  effort: Effort;
  pace: string; // "mm:ss" /km
  stroke: SwimStroke | ''; // natação
  cadence: string; // rpm (ciclismo)
  power: string; // watts (ciclismo)
  rest: string; // segundos
  repeat: string; // vezes
}

const pad = (n: number) => String(n).padStart(2, '0');
const paceToStr = (secPerKm?: number) => (secPerKm ? `${Math.floor(secPerKm / 60)}:${pad(secPerKm % 60)}` : '');
const parsePace = (value: string): number | undefined => {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};
const num = (value: string) => {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

function stepToRow(step: GuidedStep): EditorRow {
  const times = step.kind === 'repeat' ? step.times : 1;
  const single: GuidedSingleStep = step.kind === 'repeat' ? step.steps[0] : step;
  const row: EditorRow = {
    id: step.id,
    role: single.role,
    label: single.label ?? '',
    boundBy: single.bound.by,
    min: single.bound.by === 'time' ? String(Math.floor(single.bound.seconds / 60)) : '',
    sec: single.bound.by === 'time' ? String(single.bound.seconds % 60) : '',
    distance: single.bound.by === 'distance' ? (single.bound.meters >= 1000 ? String(single.bound.meters / 1000) : String(single.bound.meters)) : '',
    distanceUnit: single.bound.by === 'distance' && single.bound.meters >= 1000 ? 'km' : 'm',
    reps: single.bound.by === 'reps' ? String(single.bound.reps) : '',
    effort: single.target?.effort ?? 'moderate',
    pace: paceToStr(single.target?.paceSecPerKm),
    stroke: single.sport?.stroke ?? '',
    cadence: single.target?.cadence ? String(single.target.cadence) : '',
    power: single.target?.power ? String(single.target.power) : '',
    rest: single.rest?.by === 'time' ? String(single.rest.seconds) : '',
    repeat: String(times),
  };
  return row;
}

function rowToStep(row: EditorRow): GuidedStep {
  const bound = row.boundBy === 'time'
    ? { by: 'time' as const, seconds: Math.max(1, num(row.min) * 60 + num(row.sec)) }
    : row.boundBy === 'distance'
      ? { by: 'distance' as const, meters: Math.max(1, Math.round(num(row.distance) * (row.distanceUnit === 'km' ? 1000 : 1))) }
      : row.boundBy === 'reps'
        ? { by: 'reps' as const, reps: Math.max(1, Math.round(num(row.reps))) }
        : { by: 'open' as const };
  const paceSecPerKm = parsePace(row.pace);
  const cadence = Math.round(num(row.cadence));
  const power = Math.round(num(row.power));
  const restSec = Math.round(num(row.rest));
  const single: GuidedSingleStep = {
    kind: 'single',
    id: `${row.id}-s`,
    role: row.role,
    label: row.label.trim() || undefined,
    bound,
    target: { effort: row.effort, ...(paceSecPerKm ? { paceSecPerKm } : {}), ...(cadence > 0 ? { cadence } : {}), ...(power > 0 ? { power } : {}) },
    ...(row.stroke ? { sport: { stroke: row.stroke } } : {}),
    ...(restSec > 0 ? { rest: { by: 'time' as const, seconds: restSec } } : {}),
  };
  const times = Math.max(1, Math.round(num(row.repeat)));
  if (times > 1) return { kind: 'repeat', id: row.id, times, steps: [single] };
  return single;
}

/** Linha nova já na medida nativa do esporte (natação por metros, HIIT por reps). */
const newRow = (role: StepRole, sport: WorkoutTrainingType): EditorRow => ({
  id: crypto.randomUUID(),
  role,
  label: '',
  boundBy: sport === 'swimming' ? 'distance' : sport === 'hiit' || sport === 'functional' ? 'reps' : 'time',
  min: '5',
  sec: '0',
  distance: sport === 'swimming' ? '100' : '',
  distanceUnit: 'm',
  reps: sport === 'hiit' || sport === 'functional' ? '10' : '',
  effort: 'moderate',
  pace: '',
  stroke: '',
  cadence: '',
  power: '',
  rest: '',
  repeat: '1',
});

export function GuidedStepsEditor({ sport, steps, onChange }: { sport: WorkoutTrainingType; steps: GuidedStep[]; onChange: (steps: GuidedStep[]) => void }) {
  const { t } = useTranslation();
  const rows = useMemo(() => steps.map(stepToRow), [steps]);
  const showPace = PACE_SPORTS.includes(sport);

  const commit = (nextRows: EditorRow[]) => onChange(nextRows.map(rowToStep));
  const update = (id: string, patch: Partial<EditorRow>) => commit(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };
  const inputCls = 'min-h-10 w-full rounded-lg bg-surface px-2 font-sans text-body text-on-surface outline-none ring-1 ring-outline-variant/40 focus:ring-primary';

  return (
    <section className="border-t border-outline-variant/25 pt-6" aria-labelledby="guided-steps-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 id="guided-steps-heading" className="font-sans text-title text-on-surface">{t('offer.workout.steps.title')}</h4>
          <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('offer.workout.steps.hint')}</p>
        </div>
        <button type="button" onClick={() => commit([...rows, newRow('main', sport)])} className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 font-sans text-counter text-primary"><Plus size={16} aria-hidden />{t('offer.workout.steps.add')}</button>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row, index) => (
          <article key={row.id} className="rounded-xl bg-surface-container-low p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-sans text-counter text-primary">{index + 1}</span>
              <select value={row.role} onChange={(event) => update(row.id, { role: event.target.value as StepRole })} className="min-h-10 min-w-0 flex-1 rounded-lg bg-surface px-2 font-sans text-label text-on-surface outline-none ring-1 ring-outline-variant/40 focus:ring-primary">
                {ROLES.map((role) => <option key={role} value={role}>{t(ROLE_KEY[role])}</option>)}
              </select>
              <span className="flex shrink-0">
                <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('offer.workout.moveUp')} className="flex h-10 w-8 items-center justify-center text-on-surface-variant disabled:opacity-30"><ChevronUp size={17} aria-hidden /></button>
                <button type="button" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label={t('offer.workout.moveDown')} className="flex h-10 w-8 items-center justify-center text-on-surface-variant disabled:opacity-30"><ChevronDown size={17} aria-hidden /></button>
              </span>
              {rows.length > 1 && <button type="button" onClick={() => commit(rows.filter((item) => item.id !== row.id))} aria-label={t('offer.workout.steps.remove')} className="flex h-10 w-10 items-center justify-center rounded-full text-error"><Trash2 size={17} aria-hidden /></button>}
            </div>

            <input value={row.label} onChange={(event) => update(row.id, { label: event.target.value })} placeholder={t('offer.workout.steps.label')} className={clsx(inputCls, 'mt-3')} />

            {/* Esforço */}
            <div className="mt-3">
              <p className="font-sans text-body-sm text-on-surface-variant">{t('offer.workout.steps.effort')}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {EFFORTS.map((effort) => (
                  <button key={effort} type="button" onClick={() => update(row.id, { effort })} className={clsx('min-h-9 rounded-full px-3 font-sans text-counter transition-colors', row.effort === effort ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface')}>{t(EFFORT_KEY[effort])}</button>
                ))}
              </div>
            </div>

            {/* Medir por + valor */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block min-w-0 font-sans text-body-sm text-on-surface-variant">
                <span className="block truncate">{t('offer.workout.steps.by')}</span>
                <select value={row.boundBy} onChange={(event) => update(row.id, { boundBy: event.target.value as BoundBy })} className={clsx(inputCls, 'mt-1')}>
                  <option value="time">{t('offer.workout.steps.byTime')}</option>
                  <option value="distance">{t('offer.workout.steps.byDistance')}</option>
                  <option value="reps">{t('offer.workout.steps.byReps')}</option>
                  <option value="open">{t('offer.workout.steps.byOpen')}</option>
                </select>
              </label>

              {row.boundBy === 'time' ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="block font-sans text-body-sm text-on-surface-variant"><span className="block truncate">{t('offer.workout.steps.min')}</span><input value={row.min} inputMode="numeric" onChange={(event) => update(row.id, { min: event.target.value })} className={clsx(inputCls, 'mt-1')} /></label>
                  <label className="block font-sans text-body-sm text-on-surface-variant"><span className="block truncate">{t('offer.workout.steps.sec')}</span><input value={row.sec} inputMode="numeric" onChange={(event) => update(row.id, { sec: event.target.value })} className={clsx(inputCls, 'mt-1')} /></label>
                </div>
              ) : row.boundBy === 'distance' ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="block font-sans text-body-sm text-on-surface-variant"><span className="block truncate">{t('offer.workout.steps.byDistance')}</span><input value={row.distance} inputMode="decimal" onChange={(event) => update(row.id, { distance: event.target.value })} className={clsx(inputCls, 'mt-1')} /></label>
                  <label className="block font-sans text-body-sm text-on-surface-variant"><span className="block truncate">&nbsp;</span>
                    <select value={row.distanceUnit} onChange={(event) => update(row.id, { distanceUnit: event.target.value as 'm' | 'km' })} className={clsx(inputCls, 'mt-1')}><option value="m">m</option><option value="km">km</option></select>
                  </label>
                </div>
              ) : row.boundBy === 'reps' ? (
                <label className="block font-sans text-body-sm text-on-surface-variant"><span className="block truncate">{t('offer.workout.steps.reps')}</span><input value={row.reps} inputMode="numeric" onChange={(event) => update(row.id, { reps: event.target.value })} className={clsx(inputCls, 'mt-1')} /></label>
              ) : (
                <div className="flex items-end"><p className="pb-2 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.guided.byOpen')}</p></div>
              )}
            </div>

            {/* Campo do esporte (ritmo/estilo/cadência) + descanso + repetir */}
            <div className="mt-2 grid grid-cols-3 gap-2">
              {showPace ? (
                <label className="block min-w-0 font-sans text-body-sm text-on-surface-variant"><span className="block truncate">{t('offer.workout.steps.pace')}</span><input value={row.pace} inputMode="numeric" placeholder="5:30" onChange={(event) => update(row.id, { pace: event.target.value })} className={clsx(inputCls, 'mt-1')} /></label>
              ) : sport === 'swimming' ? (
                <label className="block min-w-0 font-sans text-body-sm text-on-surface-variant"><span className="block truncate">{t('offer.workout.steps.stroke')}</span>
                  <select value={row.stroke} onChange={(event) => update(row.id, { stroke: event.target.value as SwimStroke | '' })} className={clsx(inputCls, 'mt-1')}>
                    <option value="">—</option>
                    {STROKES.map((stroke) => <option key={stroke} value={stroke}>{t(STROKE_KEY[stroke])}</option>)}
                  </select>
                </label>
              ) : sport === 'cycling' ? (
                <>
                  <label className="block min-w-0 font-sans text-body-sm text-on-surface-variant"><span className="block truncate">{t('offer.workout.steps.cadence')}</span><input value={row.cadence} inputMode="numeric" placeholder="90" onChange={(event) => update(row.id, { cadence: event.target.value })} className={clsx(inputCls, 'mt-1')} /></label>
                  <label className="block min-w-0 font-sans text-body-sm text-on-surface-variant"><span className="block truncate">{t('offer.workout.steps.power')}</span><input value={row.power} inputMode="numeric" placeholder="200" onChange={(event) => update(row.id, { power: event.target.value })} className={clsx(inputCls, 'mt-1')} /></label>
                </>
              ) : null}
              <label className="block min-w-0 font-sans text-body-sm text-on-surface-variant"><span className="block truncate">{t('offer.workout.steps.rest')}</span><input value={row.rest} inputMode="numeric" onChange={(event) => update(row.id, { rest: event.target.value })} className={clsx(inputCls, 'mt-1')} /></label>
              <label className="block min-w-0 font-sans text-body-sm text-on-surface-variant"><span className="block truncate">{t('offer.workout.steps.repeat')}</span><input value={row.repeat} inputMode="numeric" onChange={(event) => update(row.id, { repeat: event.target.value })} className={clsx(inputCls, 'mt-1')} /></label>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
