import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { dictionaries, type TranslationKey } from './translations';
import { isSupportedLanguage, normalizeLanguageCode, type LanguageCode } from './language';

export type { TranslationKey } from './translations';
export type { LanguageCode } from './language';

const STORAGE_KEY = 'onlyfit.language';
const DEFAULT_LANGUAGE: LanguageCode = 'pt-BR';

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key) => key,
});

function interpolate(value: string, params?: Record<string, string | number>) {
  if (!params) return value;
  return value.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

function readStoredLanguage(): LanguageCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const normalized = normalizeLanguageCode(stored ?? navigator.language);
    return isSupportedLanguage(normalized) ? normalized : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(readStoredLanguage);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = dictionaries[language];
    return {
      language,
      setLanguage: (next) => {
        const normalized = normalizeLanguageCode(next);
        setLanguageState(normalized);
        localStorage.setItem(STORAGE_KEY, normalized);
      },
      t: (key, params) => interpolate(dictionary[key], params),
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook vive junto do provider
export function useTranslation() {
  return useContext(I18nContext);
}
