import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Link } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';

export function SettingCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface p-4 shadow-sm">
      {children}
    </div>
  );
}

export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-1 font-sans text-eyebrow uppercase text-on-surface-variant">{children}</h3>
  );
}

export function IconChip({
  icon: Icon,
  badge,
  compact = false,
}: {
  icon: LucideIcon;
  badge?: number;
  compact?: boolean;
}) {
  return (
    <span
      className={clsx(
        'relative flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary',
        compact ? 'h-9 w-9' : 'h-10 w-10',
      )}
    >
      <Icon size={compact ? 18 : 19} aria-hidden />
      {badge && badge > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 font-sans text-counter leading-none tabular-nums text-on-error ring-2 ring-surface">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </span>
  );
}

export function ProfileLink({
  icon: Icon,
  title,
  description,
  to,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  to?: string;
  badge?: number;
}) {
  const content = (
    <>
      <IconChip icon={Icon} badge={badge} compact={!description} />
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-body font-medium text-on-surface">{title}</span>
        {description && (
          <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
            {description}
          </span>
        )}
      </span>
      <ChevronRight size={19} className="shrink-0 text-outline" aria-hidden />
    </>
  );
  const className = clsx(
    'flex w-full items-center border-t border-outline-variant/25 px-4 text-left transition-colors first:border-t-0 active:bg-surface-container-low',
    description ? 'min-h-[64px] gap-4 py-3' : 'min-h-[56px] gap-3 py-2',
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={className}>
      {content}
    </button>
  );
}
