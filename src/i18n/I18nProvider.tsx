import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { dictionaries, type TranslationKey } from './translations';

// Para suportar um novo idioma no futuro: adicione o dicionário em
// translations.ts e inclua o código + rótulo aqui. Nenhum outro arquivo do
// app precisa saber quais idiomas existem.
// eslint-disable-next-line react-refresh/only-export-components -- lista de idiomas vive junto do provider
export const SUPPORTED_LANGUAGES = [
  { code: 'pt', label: 'PT' },
  { code: 'en', label: 'EN' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const STORAGE_KEY = 'onlyfit.language';
const DEFAULT_LANGUAGE: LanguageCode = 'pt';

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key) => key,
});

function isSupportedLanguage(value: string | null): value is LanguageCode {
  return SUPPORTED_LANGUAGES.some((option) => option.code === value);
}

function readStoredLanguage(): LanguageCode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(readStoredLanguage);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = dictionaries[language];
    return {
      language,
      setLanguage: (next) => {
        setLanguageState(next);
        localStorage.setItem(STORAGE_KEY, next);
      },
      t: (key) => dictionary[key],
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook vive junto do provider
export function useTranslation() {
  return useContext(I18nContext);
}
