export const SUPPORTED_LANGUAGES = [
  { code: 'pt-BR', label: 'PT-BR', nativeName: 'Português (Brasil)' },
  { code: 'pt-PT', label: 'PT-PT', nativeName: 'Português (Portugal)' },
  { code: 'en-US', label: 'EN', nativeName: 'English' },
  { code: 'es', label: 'ES', nativeName: 'Español' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const DEFAULT_LANGUAGE: LanguageCode = 'pt-BR';

export function normalizeLanguageCode(value: string | null | undefined): LanguageCode {
  const raw = (value ?? '').trim();
  if (!raw) return DEFAULT_LANGUAGE;

  const lower = raw.toLowerCase().replace('_', '-');
  if (lower === 'pt' || lower === 'pt-br' || lower.startsWith('pt-br-')) return 'pt-BR';
  if (lower === 'pt-pt' || lower.startsWith('pt-pt-')) return 'pt-PT';
  if (lower === 'en' || lower === 'en-us' || lower.startsWith('en-')) return 'en-US';
  if (lower === 'es' || lower.startsWith('es-')) return 'es';
  return DEFAULT_LANGUAGE;
}

export function intlLocaleFromLanguage(language: string | null | undefined): string {
  const normalized = normalizeLanguageCode(language);
  if (normalized === 'pt-PT') return 'pt-PT';
  if (normalized === 'en-US') return 'en-US';
  if (normalized === 'es') return 'es-ES';
  return 'pt-BR';
}

export function isSupportedLanguage(value: string | null): value is LanguageCode {
  return SUPPORTED_LANGUAGES.some((option) => option.code === value);
}
