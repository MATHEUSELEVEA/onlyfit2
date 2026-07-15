import { useEffect, useId, type ReactNode } from 'react';
import { clsx } from 'clsx';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Ajustes de altura/layout do painel (ex.: altura fixa para lista + composer). */
  panelClassName?: string;
}

// Bottom sheet padrão do app: backdrop com blur, painel com cantos
// arredondados no topo, alça de arrasto e fechamento por Escape/backdrop.
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  panelClassName,
}: BottomSheetProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    // z acima da BottomNav: senão a nav pinta sobre o rodapé do sheet,
    // escondendo botões e o campo de comentário.
    <div className="fixed inset-0 z-[var(--z-sheet)]" role="presentation">
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="absolute inset-0 h-full w-full bg-black/55 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-modal="true"
        className={clsx(
          'absolute inset-x-0 bottom-0 flex max-h-[88%] flex-col overflow-hidden rounded-t-2xl border-t border-outline-variant/30 bg-background pb-safe-bottom shadow-2xl',
          panelClassName,
        )}
      >
        <div className="shrink-0 bg-background px-5 pb-2 pt-3">
          <div className="flex justify-center">
            <span className="h-1 w-10 rounded-full bg-outline-variant" aria-hidden />
          </div>
          <h2 id={titleId} className="mt-4 font-sans text-title text-on-surface">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 font-sans text-body-sm text-on-surface-variant">
              {description}
            </p>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
