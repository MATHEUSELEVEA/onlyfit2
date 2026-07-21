import type { ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * Anel de progresso minimalista (estilo "mover"). Trilha discreta + arco na cor
 * de marca. Sem gradiente nem sombra — premium por precisão, não por brilho.
 * A cor do arco vem de `currentColor`, então o token é definido pelo pai.
 */
export function ActivityRing({
  progress,
  size = 44,
  stroke = 4,
  className,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className={clsx('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-outline-variant/60"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-primary transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </svg>
      {children ? <span className="absolute inset-0 flex items-center justify-center">{children}</span> : null}
    </span>
  );
}

/**
 * Métrica compacta: valor forte + rótulo discreto. Hierarquia por peso/tamanho
 * (tokens), sem cartão dentro de cartão.
 */
export function MetricStat({
  value,
  label,
  icon,
  emphasis = false,
}: {
  value: string;
  label: string;
  icon?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {icon ? <span className={emphasis ? 'text-primary' : 'text-on-surface-variant'}>{icon}</span> : null}
        <span className={clsx('font-sans text-title tabular-nums', emphasis ? 'text-primary' : 'text-on-surface')}>{value}</span>
      </div>
      <span className="font-sans text-counter text-on-surface-variant">{label}</span>
    </div>
  );
}
