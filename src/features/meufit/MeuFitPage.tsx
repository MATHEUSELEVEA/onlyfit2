import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Clock3, Dumbbell, Salad, Stethoscope, type LucideIcon } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import { PageTopBar } from '@/components/layout/PageTopBar';

export function MeuFitPage() {
  const { t } = useTranslation();
  const [pressedDestination, setPressedDestination] = useState<string | null>(null);

  const pillars: Array<{ icon: LucideIcon; title: string; to: string }> = [
    {
      icon: Clock3,
      title: t('meufit.routine.short'),
      to: '/meu-fit/rotina',
    },
    {
      icon: Dumbbell,
      title: t('meufit.training.short'),
      to: '/meu-fit/treino',
    },
    {
      icon: Salad,
      title: t('meufit.diet.short'),
      to: '/meu-fit/dieta',
    },
    {
      icon: Stethoscope,
      title: t('meufit.health.short'),
      to: '/perfil/saude/novo?origem=meu-fit',
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background pb-10">
      <PageTopBar title={t('meufit.title')} showBackButton={false} />
      <div className="mx-auto flex w-full max-w-[720px] flex-1 items-center px-6 py-6">
        <div className="grid w-full grid-cols-2 place-items-center gap-5">
          {pillars.map(({ icon: Icon, title, to }) => (
            <Link
              key={to}
              to={to}
              onPointerDown={() => setPressedDestination(to)}
              onPointerUp={() => setPressedDestination(null)}
              onPointerCancel={() => setPressedDestination(null)}
              onBlur={() => setPressedDestination(null)}
              className={`relative flex aspect-square w-full max-w-[160px] flex-col items-center justify-center gap-4 rounded-full border border-outline-variant/40 bg-surface-container p-4 text-center transition-[transform,background-color,border-color] duration-200 ease-out ${pressedDestination === to ? 'z-10 scale-110 border-primary bg-primary/10' : pressedDestination ? 'scale-95' : 'active:scale-110 active:border-primary active:bg-primary/10'}`}
            >
              <Icon size={52} className="text-primary" aria-hidden />
              <span className="font-sans text-label text-on-surface">{title}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
