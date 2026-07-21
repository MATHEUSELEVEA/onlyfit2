import type { TranslationKey } from '@/i18n/I18nProvider';
import type { TrainingSurface } from '@/features/training/TrainingProvider';

/**
 * Especificidade por esporte no lado da ATIVIDADE realizada (espelho do
 * SPECIFIC_FIELDS da prescrição). Cada esporte tem sua métrica-mãe: corrida =
 * ritmo (min/km), bike = velocidade/potência, natação = ritmo /100m, força =
 * duração/FC, etc. Uma única fonte da verdade dirige lista, resumo e detalhe.
 *
 * `hero` = destaque (grid do resumo, linha compacta da lista).
 * `more` = complementares (mostradas no detalhe).
 * Só entram métricas com valor real — nada de placeholder.
 */

export interface ActivityMetric {
  labelKey: TranslationKey;
  value: string;
}

/** Subconjunto estrutural de ImportedActivity/WearableActivity que a config usa. */
export interface SportActivityLike {
  surface: TrainingSurface;
  durationMin: number;
  movingTimeMin?: number;
  distanceKm?: number;
  calories?: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  averageSpeedKmh?: number;
  averagePowerW?: number;
  weightedPowerW?: number;
  elevationM?: number;
  sourcePayload?: Record<string, unknown>;
}

const PACE_SURFACES: TrainingSurface[] = ['running', 'walking'];

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Ritmo em min por km: "5:30". */
export function paceMinPerKm(distanceKm?: number, minutes?: number): string | null {
  if (!distanceKm || !minutes || distanceKm <= 0 || minutes <= 0) return null;
  const secPerKm = Math.round((minutes * 60) / distanceKm);
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return null;
  return `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, '0')}`;
}

/** Ritmo de natação em min por 100 m: "1:45". */
function pacePer100m(distanceKm?: number, minutes?: number): string | null {
  if (!distanceKm || !minutes || distanceKm <= 0 || minutes <= 0) return null;
  const secPer100 = Math.round((minutes * 60) / (distanceKm * 10));
  if (!Number.isFinite(secPer100) || secPer100 <= 0) return null;
  return `${Math.floor(secPer100 / 60)}:${String(secPer100 % 60).padStart(2, '0')}`;
}

/**
 * SWOLF aproximado (eficiência de nado por piscina): segundos/volta + braçadas/
 * volta. Precisa de braçadas totais + distância + tempo + comprimento da piscina.
 */
function swolf(distanceKm?: number, minutes?: number, strokes?: number, poolLengthM = 25): number | null {
  if (!distanceKm || !minutes || !strokes || poolLengthM <= 0) return null;
  const lengths = (distanceKm * 1000) / poolLengthM;
  if (lengths <= 0) return null;
  const secondsPerLength = (minutes * 60) / lengths;
  const strokesPerLength = strokes / lengths;
  const value = Math.round(secondsPerLength + strokesPerLength);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const m = (labelKey: TranslationKey, value: string | null | undefined): ActivityMetric | null =>
  value ? { labelKey, value } : null;

export interface SportMetricSet {
  hero: ActivityMetric[];
  more: ActivityMetric[];
}

export function activityMetrics(activity: SportActivityLike): SportMetricSet {
  const minutes = activity.movingTimeMin ?? activity.durationMin;
  const sp = activity.sourcePayload ?? {};
  const cadenceSpm = num(sp.cadence_spm);
  const strokes = num(sp.swim_stroke_count);
  const poolLengthM = num(sp.pool_length_m) ?? 25;

  const duration = m('meufit.training.metric.duration', activity.durationMin ? `${activity.durationMin} min` : null);
  const distance = m('meufit.training.metric.distance', activity.distanceKm ? `${activity.distanceKm.toLocaleString('pt-BR')} km` : null);
  const kcal = m('meufit.training.metric.calories', activity.calories ? `${activity.calories} kcal` : null);
  const avgHr = m('meufit.training.metric.avgHr', activity.averageHeartRate ? `${activity.averageHeartRate} bpm` : null);
  const maxHr = m('meufit.training.metric.maxHr', activity.maxHeartRate ? `${activity.maxHeartRate} bpm` : null);
  const elevation = m('meufit.training.metric.elevation', activity.elevationM ? `${activity.elevationM} m` : null);
  const pace = m('meufit.training.metric.pace', (() => { const p = paceMinPerKm(activity.distanceKm, minutes); return p ? `${p} /km` : null; })());
  const pace100 = m('meufit.training.metric.pace100', (() => { const p = pacePer100m(activity.distanceKm, minutes); return p ? `${p} /100m` : null; })());
  const speed = m('meufit.training.metric.speed', activity.averageSpeedKmh ? `${activity.averageSpeedKmh.toLocaleString('pt-BR')} km/h` : null);
  const power = m('meufit.training.metric.power', activity.averagePowerW ? `${activity.averagePowerW} W` : null);
  const cadence = m('meufit.training.metric.cadence', cadenceSpm ? `${cadenceSpm} spm` : null);
  const strokeCount = m('meufit.training.metric.strokes', strokes ? `${strokes}` : null);
  const swolfValue = m('meufit.training.metric.swolf', (() => { const s = swolf(activity.distanceKm, minutes, strokes, poolLengthM); return s ? `${s}` : null; })());

  const compact = (hero: (ActivityMetric | null)[], more: (ActivityMetric | null)[]): SportMetricSet => ({
    hero: hero.filter((item): item is ActivityMetric => item !== null),
    more: more.filter((item): item is ActivityMetric => item !== null),
  });

  switch (activity.surface) {
    case 'running':
    case 'walking':
      return compact([pace, distance, duration], [avgHr, cadence, elevation, kcal, maxHr]);
    case 'cycling':
      // Potência é a métrica-mãe quando há sensor; senão a velocidade assume o
      // destaque (e não se repete nas complementares).
      return compact([power ?? speed, distance, duration], [avgHr, power ? speed : null, elevation, kcal, maxHr]);
    case 'swimming':
      return compact([pace100, distance, duration], [avgHr, strokeCount, swolfValue, kcal]);
    case 'strength':
      return compact([duration, kcal, avgHr], [maxHr]);
    case 'hiit':
    case 'functional':
      return compact([duration, avgHr, kcal], [maxHr, distance]);
    case 'yoga':
    case 'pilates':
      return compact([duration, kcal, avgHr], [maxHr]);
    default:
      return compact([duration, distance, kcal], [avgHr, maxHr, elevation]);
  }
}

/** Linha compacta (só valores da métrica-mãe) para listas: "32 min · 5,2 km · 5:30 /km". */
export function activityMetaLine(activity: SportActivityLike): string {
  return activityMetrics(activity).hero.map((metric) => metric.value).join(' · ');
}

/**
 * Métricas sport-specific que vêm do source_payload (capturadas no Swift) ou
 * derivadas: cadência, braçadas, SWOLF e comprimento da piscina. Aparecem no
 * detalhe da atividade, só quando há valor.
 */
export function activitySportDetails(activity: SportActivityLike): ActivityMetric[] {
  const sp = activity.sourcePayload ?? {};
  const minutes = activity.movingTimeMin ?? activity.durationMin;
  const cadenceSpm = num(sp.cadence_spm);
  const strokes = num(sp.swim_stroke_count);
  const poolLengthM = num(sp.pool_length_m);
  const rows: (ActivityMetric | null)[] = [
    m('meufit.training.metric.cadence', cadenceSpm ? `${cadenceSpm} spm` : null),
    m('meufit.training.metric.strokes', strokes ? `${strokes}` : null),
    m('meufit.training.metric.swolf', (() => { const value = swolf(activity.distanceKm, minutes, strokes, poolLengthM ?? 25); return value ? `${value}` : null; })()),
    m('meufit.training.metric.pool', poolLengthM ? `${poolLengthM} m` : null),
  ];
  return rows.filter((row): row is ActivityMetric => row !== null);
}

export { PACE_SURFACES };
