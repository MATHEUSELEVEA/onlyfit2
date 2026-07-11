import { clsx } from 'clsx';

// Pílula de filtro (aba/tag) usada nas telas de descoberta e marketplace.
export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'min-h-[36px] shrink-0 whitespace-nowrap rounded-full px-4 font-sans text-label transition-colors',
        active
          ? 'bg-primary text-on-primary shadow-sm'
          : 'border border-outline-variant/50 bg-surface text-on-surface-variant',
      )}
    >
      {children}
    </button>
  );
}
