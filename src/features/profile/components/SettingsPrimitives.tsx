import type { ReactNode } from 'react';
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

export function IconChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon size={19} aria-hidden />
    </span>
  );
}

export function ProfileLink({
  icon: Icon,
  title,
  description,
  to,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  to?: string;
}) {
  const content = (
    <>
      <IconChip icon={Icon} />
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-body font-medium text-on-surface">{title}</span>
        <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
          {description}
        </span>
      </span>
      <ChevronRight size={19} className="shrink-0 text-outline" aria-hidden />
    </>
  );
  const className =
    'flex min-h-[72px] w-full items-center gap-4 border-t border-outline-variant/25 px-4 py-4 text-left transition-colors first:border-t-0 active:bg-surface-container-low';

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
