import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, PencilLine } from 'lucide-react';
import { clsx } from 'clsx';
import { applyFontScale, readFontScale, MAX_FONT_SCALE, MIN_FONT_SCALE } from '@/theme/fontScale';
import { THEMES, useTheme, type ThemeId } from '@/theme/ThemeProvider';
import { useTranslation } from '@/i18n/I18nProvider';
import { IconChip, SectionEyebrow, SettingCard } from './components/SettingsPrimitives';

// Espelha 1:1 `--color-surface` de cada tema em src/theme/themes.css.
const themeSwatches: Record<ThemeId, string> = {
  preto: '#121315',
  claro: '#F4F5EE',
};

export function VisualPreferencesPage() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [fontScale, setFontScale] = useState(readFontScale);

  useEffect(() => {
    applyFontScale(fontScale);
  }, [fontScale]);

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <div className="mx-auto min-h-full w-full max-w-[720px] bg-background md:my-6 md:overflow-hidden md:rounded-3xl md:border md:border-outline-variant/30 md:shadow-xl">
        <header className="sticky top-0 z-10 border-b border-outline-variant/30 bg-surface-container-lowest/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              to="/perfil"
              aria-label={t('visual.back')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-sans text-title-lg text-on-surface">{t('visual.title')}</h1>
              <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
                {t('visual.description')}
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-3 px-4 pt-4">
          <SectionEyebrow>{t('profile.section.preferences')}</SectionEyebrow>

          <SettingCard>
            <label
              htmlFor="font-scale"
              className="flex items-center gap-3 font-sans text-body font-semibold text-on-surface"
            >
              <IconChip icon={PencilLine} />
              {t('profile.fontSize.title')}
            </label>
            <div className="mt-4 flex items-center gap-3 text-on-surface">
              <button
                type="button"
                aria-label={t('profile.fontSize.decrease')}
                onClick={() => setFontScale((value) => Math.max(MIN_FONT_SCALE, value - 1))}
                disabled={fontScale <= MIN_FONT_SCALE}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-container-highest font-sans text-counter text-on-surface transition-transform active:scale-90 disabled:opacity-30"
              >
                A
              </button>
              <input
                id="font-scale"
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-container-highest accent-primary"
                max={MAX_FONT_SCALE}
                min={MIN_FONT_SCALE}
                step="1"
                type="range"
                value={fontScale}
                onChange={(event) => setFontScale(Number(event.target.value))}
              />
              <button
                type="button"
                aria-label={t('profile.fontSize.increase')}
                onClick={() => setFontScale((value) => Math.min(MAX_FONT_SCALE, value + 1))}
                disabled={fontScale >= MAX_FONT_SCALE}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-container-highest font-sans text-title-lg text-on-surface transition-transform active:scale-90 disabled:opacity-30"
              >
                A
              </button>
            </div>
          </SettingCard>

          <SettingCard>
            <p className="font-sans text-body font-semibold text-on-surface">{t('profile.theme.title')}</p>
            <div
              className="mt-4 flex items-center gap-4"
              role="group"
              aria-label={t('profile.theme.title')}
            >
              {THEMES.map(({ id, label }) => {
                const active = theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    aria-label={label}
                    aria-pressed={active}
                    className={clsx(
                      'relative flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90',
                      active
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface'
                        : 'ring-1 ring-outline-variant/40',
                    )}
                  >
                    <span
                      className="h-8 w-8 rounded-full"
                      style={{ backgroundColor: themeSwatches[id] }}
                    />
                    {active && (
                      <Check
                        size={15}
                        className="absolute text-white"
                        strokeWidth={3}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </SettingCard>
        </div>
      </div>
    </div>
  );
}
