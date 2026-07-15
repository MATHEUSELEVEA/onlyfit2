import type { TranslationKey } from '@/i18n/translations';
import type { ChallengeFrequency, ChallengeRun } from './types';

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

export function formatDate(value: string): string {
  return DATE_FORMAT.format(new Date(value));
}

export function formatDateRange(startAt: string, endAt: string): string {
  return `${formatDate(startAt)} – ${formatDate(endAt)}`;
}

export function challengeStatusKey(run: ChallengeRun): TranslationKey {
  if (run.status === 'completed') return 'challenges.status.completed';
  if (run.status === 'cancelled') return 'challenges.status.cancelled';
  if (run.status === 'active') return 'challenges.status.active';
  return 'challenges.status.scheduled';
}

export function frequencyKey(frequency: ChallengeFrequency): TranslationKey {
  switch (frequency) {
    case 'daily':
      return 'challenges.frequency.daily';
    case 'weekly':
      return 'challenges.frequency.weekly';
    case 'biweekly':
      return 'challenges.frequency.biweekly';
    case 'monthly':
      return 'challenges.frequency.monthly';
    default:
      return 'challenges.frequency.full';
  }
}

/** "Hoje" | "Esta semana" | "Esta quinzena" | "Este mês" | "Até o final". */
export function frequencyPeriodKey(frequency: ChallengeFrequency): TranslationKey {
  switch (frequency) {
    case 'daily':
      return 'challenges.period.today';
    case 'weekly':
      return 'challenges.period.week';
    case 'biweekly':
      return 'challenges.period.biweek';
    case 'monthly':
      return 'challenges.period.month';
    default:
      return 'challenges.period.full';
  }
}

export function displayName(profile: { username: string | null; full_name: string | null } | null, fallback: string): string {
  return profile?.full_name || profile?.username || fallback;
}
