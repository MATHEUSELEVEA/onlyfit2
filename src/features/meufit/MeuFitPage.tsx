import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Clock3, Dumbbell, Salad, Sparkles, Stethoscope, type LucideIcon } from 'lucide-react';
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
      <PageTopBar
        title={t('meufit.title')}
        showBackButton={false}
        actions={
          <Link
            to="/meu-fit/ia"
            aria-label="Abrir IA OnlyFit"
            className="group relative flex h-11 min-w-11 items-center justify-center rounded-full border border-outline-variant/35 bg-surface-container-low px-3 text-on-surface transition-[border-color,background-color,transform] active:scale-[0.97] active:border-primary/70 active:bg-primary/10"
          >
            <Sparkles size={17} className="text-primary" aria-hidden />
            <span className="ml-1.5 font-sans text-label text-on-surface">IA</span>
            <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-primary/0 transition group-active:ring-primary/40" />
          </Link>
        }
      />
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center px-6 py-6">
        <Link
          to="/meu-fit/ia"
          className="mb-6 flex items-center justify-between rounded-full border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-on-surface transition-[border-color,background-color,transform] active:scale-[0.99] active:border-primary/60 active:bg-primary/10"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles size={14} aria-hidden />
            </span>
            <span className="truncate font-sans text-body-sm text-on-surface-variant">
              IA com treino, dieta e saúde
            </span>
          </span>
          <span className="font-sans text-counter text-primary">Abrir</span>
        </Link>

        <div className="grid w-full grid-cols-2 place-items-center gap-5">
          {pillars.map(({ icon: Icon, title, to }) => (
            <Link
              key={to}
              to={to}
              onPointerDown={() => setPressedDestination(to)}
              onPointerUp={() => setPressedDestination(null)}
              onPointerCancel={() => setPressedDestination(null)}
              onBlur={() => setPressedDestination(null)}
              className={`relative flex aspect-square w-full max-w-[160px] flex-col items-center justify-center gap-4 rounded-2xl border border-outline-variant/40 bg-surface-container p-4 text-center transition-[transform,background-color,border-color] duration-200 ease-out ${pressedDestination === to ? 'z-10 scale-110 border-primary bg-primary/10' : pressedDestination ? 'scale-95' : 'active:scale-110 active:border-primary active:bg-primary/10'}`}
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
