import {
  intlLocaleFromLanguage,
  normalizeLanguageCode,
  type LanguageCode,
} from '@/i18n/language';
import { dictionaries } from '@/i18n/translations';

function locale(language: LanguageCode): string {
  return intlLocaleFromLanguage(language);
}

function translateTime(key: 'messages.time.now', language: LanguageCode): string {
  return dictionaries[normalizeLanguageCode(language)][key];
}

/** Rótulo relativo curto para a lista de conversas (agora, 5min, 3h, 2d, data). */
export function timeAgo(dateStr: string, language: LanguageCode): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return translateTime('messages.time.now', language);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString(locale(language));
}

/** Hora curta (HH:MM) para o rodapé da bolha. */
export function clockTime(dateStr: string, language: LanguageCode): string {
  return new Date(dateStr).toLocaleTimeString(locale(language), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Duração de nota de voz (m:ss) a partir de milissegundos. */
export function formatDuration(ms: number | undefined): string {
  if (!ms || ms < 0) return '0:00';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
