import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

export function HealthPageShell({ children, width = 'wide' }: { children: ReactNode; width?: 'wide' | 'form' }) {
  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <div
        className={clsx(
          'mx-auto min-h-full w-full bg-background md:my-6 md:overflow-hidden md:rounded-3xl md:border md:border-outline-variant/30 md:shadow-xl',
          width === 'wide' ? 'max-w-[920px]' : 'max-w-[720px]',
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function HealthPageHeader({
  title,
  description,
  backTo = '/perfil/saude',
  actions,
}: {
  title: string;
  description?: string;
  backTo?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-outline-variant/30 bg-surface-container-lowest/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
      <div className="flex items-center gap-3">
        <Link
          to={backTo}
          aria-label="Voltar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors active:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft size={21} aria-hidden />
        </Link>
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

export function HealthIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon size={19} aria-hidden />
    </span>
  );
}

export function FeedbackMessage({ type, children }: { type: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <p
      role={type === 'error' ? 'alert' : 'status'}
      className={clsx(
        'rounded-xl px-3 py-3 font-sans text-body-sm',
        type === 'error' && 'bg-error-container text-on-error-container',
        type === 'success' && 'bg-primary-container text-on-primary-container',
        type === 'info' && 'bg-surface-container-low text-on-surface-variant',
      )}
    >
      {children}
    </p>
  );
}

export function LoadingRows() {
  return (
    <div className="space-y-3" aria-label="Carregando">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex animate-pulse gap-3 py-3">
          <span className="h-10 w-10 shrink-0 rounded-full bg-surface-container-high" />
          <span className="flex-1 space-y-2">
            <span className="block h-4 w-2/3 rounded bg-surface-container-high" />
            <span className="block h-3 w-1/2 rounded bg-surface-container" />
          </span>
        </div>
      ))}
    </div>
  );
}
