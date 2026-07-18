import type { ReactNode } from 'react';
import { BackButton } from '@/components/ui/BackButton';

/**
 * Barra de topo padrão com título, descrição opcional e botão de voltar quando necessário.
 * Usada pelas telas do menu inferior e navegáveis simples (Meu Fit, Explorar, Mercado, Treino, Dieta).
 * Só título (+ descrição); busca e demais controles ficam no corpo da página.
 */
export function PageTopBar({
  title,
  description,
  backFallback,
  actions,
  showBackButton = true,
  inlineDescription = false,
}: {
  title: string;
  description?: string;
  backFallback?: string;
  actions?: ReactNode;
  showBackButton?: boolean;
  inlineDescription?: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-outline-variant/30 bg-surface-container-lowest/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
      <div className="flex items-center gap-3">
        {showBackButton ? <BackButton fallback={backFallback} /> : null}
        <div className={inlineDescription ? 'flex min-w-0 flex-1 items-baseline gap-2' : 'min-w-0 flex-1'}>
          <h1 className={inlineDescription ? 'shrink-0 font-sans text-title-lg text-on-surface' : 'line-clamp-2 font-sans text-title-lg text-on-surface'}>
            {title}
          </h1>
          {description ? (
            <p className={inlineDescription ? 'truncate font-sans text-body-sm text-on-surface-variant' : 'mt-0.5 font-sans text-body-sm text-on-surface-variant'}>
              {description}
            </p>
          ) : null}
        </div>
        {actions}
      </div>
    </header>
  );
}
