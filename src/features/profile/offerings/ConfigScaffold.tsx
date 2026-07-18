import { Wrench } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/translations';

// Placeholder comum das telas de configuração por tipo. Cada tipo passa a sua
// própria linha (stubKey) para deixar claro o que ali será construído; quando
// a tela de fato existir, o componente do tipo substitui este scaffold.
export function ConfigScaffold({ stubKey }: { stubKey: TranslationKey }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-3 rounded-2xl bg-surface-container p-5">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Wrench size={19} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-sans text-body font-semibold text-on-surface">
          {t('profile.business.offers.config.soon')}
        </p>
        <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t(stubKey)}</p>
      </div>
    </div>
  );
}
