import { Link, useLocation } from 'react-router-dom';
import { Clock3, Dumbbell, Salad, Stethoscope } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from '@/i18n/I18nProvider';

const items = [
  { to: '/meu-fit/rotina', key: 'meufit.routine.short', icon: Clock3 },
  { to: '/meu-fit/treino', key: 'meufit.training.short', icon: Dumbbell },
  { to: '/meu-fit/dieta', key: 'meufit.diet.short', icon: Salad },
  { to: '/perfil/saude/novo?origem=meu-fit', key: 'meufit.health.short', icon: Stethoscope },
] as const;

export function MyFitSectionNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Seções do My Fit">
      {items.map(({ to, key, icon: Icon }) => {
        const active = pathname === to.split('?')[0] || (to.startsWith('/perfil/saude') && pathname.startsWith('/perfil/saude'));
        return (
          <Link
            key={to}
            to={to}
            className={clsx(
              'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 font-sans text-counter transition-colors',
              active
                ? 'border-primary bg-primary text-on-primary'
                : 'border-outline-variant/40 bg-surface-container text-on-surface-variant active:bg-surface-container-high',
            )}
          >
            <Icon size={15} aria-hidden />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
