import { Link } from 'react-router-dom';
import { ChevronRight, Dumbbell, Salad, Stethoscope, type LucideIcon } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import { PageTopBar } from '@/components/layout/PageTopBar';

/**
 * Hub "Meu Fit": porta de entrada única e intuitiva para os três pilares do
 * acompanhamento pessoal, sempre nesta ordem — Treino, Dieta e Registro de saúde.
 *
 * Estrutura preparada: cada cartão já navega para sua rota; o conteúdo interno
 * (planos de treino, orientações de dieta) ainda será implementado.
 */
export function MeuFitPage() {
  const { t } = useTranslation();

  const pillars: Array<{ icon: LucideIcon; title: string; description: string; to: string }> = [
    {
      icon: Dumbbell,
      title: t('meufit.training.title'),
      description: t('meufit.training.description'),
      to: '/meu-fit/treino',
    },
    {
      icon: Salad,
      title: t('meufit.diet.title'),
      description: t('meufit.diet.description'),
      to: '/meu-fit/dieta',
    },
    {
      icon: Stethoscope,
      title: t('meufit.health.title'),
      description: t('meufit.health.description'),
      to: '/perfil/saude/novo?origem=meu-fit',
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <PageTopBar title={t('meufit.title')} description={t('meufit.subtitle')} showBackButton={false} />
      <div className="mx-auto w-full max-w-[720px] px-6 pt-6">
        <div className="space-y-4">
          {pillars.map(({ icon: Icon, title, description, to }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-4 rounded-2xl border border-outline-variant/40 bg-surface p-5 shadow-sm transition-transform active:scale-[0.99]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon size={24} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-title text-on-surface">{title}</span>
                <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
                  {description}
                </span>
              </span>
              <ChevronRight size={20} className="shrink-0 text-outline" aria-hidden />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
