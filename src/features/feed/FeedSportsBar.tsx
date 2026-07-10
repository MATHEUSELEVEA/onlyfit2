import { clsx } from 'clsx';
import { FEED_SPORTS } from './sports';

interface FeedSportsBarProps {
  selected: string | null;
  onSelect: (key: string | null) => void;
}

// "Tudo" (key null = sem filtro) + os esportes, em ordem fixa.
const TABS: { key: string | null; label: string }[] = [
  { key: null, label: 'Tudo' },
  ...FEED_SPORTS,
];

export function FeedSportsBar({ selected, onSelect }: FeedSportsBarProps) {
  return (
    <div
      className="no-scrollbar flex gap-5 overflow-x-auto px-4"
      role="tablist"
      aria-label="Grupos de afinidade"
    >
      {TABS.map((tab) => {
        const active = selected === tab.key;
        return (
          <button
            key={tab.key ?? 'all'}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab.key)}
            className="relative shrink-0 py-1"
          >
            <span
              className={clsx(
                'font-sans text-body drop-shadow transition-colors',
                active ? 'font-semibold text-white' : 'text-white/60',
              )}
            >
              {tab.label}
            </span>
            {active && (
              <span className="absolute -bottom-0.5 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
