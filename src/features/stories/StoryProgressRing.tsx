import { clsx } from 'clsx';

interface StoryProgressRingProps {
  /** 0 (início) a 1 (acabando) da reprodução do story atual. */
  progress: number;
  size?: number;
}

// Não é a barra linear do Instagram — o usuário pediu um "relogiozinho de
// ponteiro virando e preenchendo o tempo": um relógio analógico ao redor do
// avatar do creator, com um arco que preenche em sentido horário a partir do
// topo (12h) e um ponteiro que gira até a posição correspondente. Perto do
// fim (>85%) o traço muda para um tom de alerta, reforçando "está acabando".
export function StoryProgressRing({ progress, size = 64 }: StoryProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const strokeWidth = 3;
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped);
  const angleRad = clamped * 2 * Math.PI;
  const pointerX = center + radius * Math.sin(angleRad);
  const pointerY = center - radius * Math.cos(angleRad);
  const nearEnd = clamped > 0.85;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="white" strokeOpacity={0.25} strokeWidth={strokeWidth} />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        className={clsx('transition-colors duration-300', nearEnd ? 'stroke-error' : 'stroke-primary')}
      />
      <line
        x1={center}
        y1={center}
        x2={pointerX}
        y2={pointerY}
        strokeWidth={2}
        strokeLinecap="round"
        className={clsx('transition-colors duration-300', nearEnd ? 'stroke-error' : 'stroke-primary')}
      />
      <circle cx={center} cy={center} r={2} className={clsx(nearEnd ? 'fill-error' : 'fill-primary')} />
    </svg>
  );
}
