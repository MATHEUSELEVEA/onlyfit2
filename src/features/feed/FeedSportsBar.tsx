import { clsx } from 'clsx';
import { useAffinityGroups } from '@/lib/sports';

interface FeedSportsBarProps {
  selected: string | null;
  availableSports: string[];
  onSelect: (key: string | null) => void;
}

export function FeedSportsBar({ selected, availableSports, onSelect }: FeedSportsBarProps) {
  const { labelFor } = useAffinityGroups();

  // `availableSports` já vem do banco (feed_home_available_sports) na ordem da
  // taxonomia, e é ele quem manda: mostra só grupo com conteúdo pro usuário.
  const tabs: { key: string | null; label: string }[] = [
    { key: null, label: 'Tudo' },
    ...availableSports.filter(Boolean).map((key) => ({ key, label: labelFor(key) })),
  ];

  return (
    <div
      className="no-scrollbar flex gap-5 overflow-x-auto px-4"
      role="tablist"
      aria-label="Grupos de afinidade"
    >
      {tabs.map((tab) => {
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
                'font-sans text-label drop-shadow transition-colors',
                active ? 'font-semibold text-white' : 'font-normal text-white/70',
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
