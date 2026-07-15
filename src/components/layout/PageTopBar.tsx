import type { ReactNode } from 'react';
import { BackButton } from '@/components/ui/BackButton';

/**
 * Barra de topo padrão com botão de voltar, título e descrição opcional.
 * Usada pelas telas navegáveis simples (Meu Fit, Treino, Dieta).
 */
export function PageTopBar({
  title,
  description,
  backFallback,
  actions,
}: {
  title: string;
  description?: string;
  backFallback?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-outline-variant/30 bg-surface-container-lowest/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
      <div className="flex items-center gap-3">
        <BackButton fallback={backFallback} />
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 font-sans text-title-lg text-on-surface">{title}</h1>
          {description ? (
            <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
    </header>
  );
}
