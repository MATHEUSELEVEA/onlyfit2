import { Link } from 'react-router-dom';
import { Dumbbell, Salad, Stethoscope, type LucideIcon } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import { PageTopBar } from '@/components/layout/PageTopBar';

/**
 * Hub "My Fit": porta de entrada única e intuitiva para os três pilares do
 * acompanhamento pessoal, sempre nesta ordem — Treino, Dieta e Registro de saúde.
 *
 * Estrutura preparada: cada cartão já navega para sua rota; o conteúdo interno
 * (planos de treino, orientações de dieta) ainda será implementado.
 */
export function MeuFitPage() {
  const { t } = useTranslation();

  const pillars: Array<{ icon: LucideIcon; title: string; to: string }> = [
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
    <div className="h-full overflow-y-auto bg-background pb-10">
      <PageTopBar title={t('meufit.title')} showBackButton={false} />
      <div className="mx-auto w-full max-w-[720px] px-6 pt-6">
        <div className="grid grid-cols-3 gap-3">
          {pillars.map(({ icon: Icon, title, to }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-[132px] flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container p-3 text-center transition-transform active:scale-[0.97]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon size={24} aria-hidden />
              </span>
              <span className="font-sans text-label text-on-surface">{title}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
