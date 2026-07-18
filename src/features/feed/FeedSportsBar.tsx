import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useAffinityGroups } from '@/lib/sports';

interface FeedSportsBarProps {
  selected: string[];
  availableSports: string[];
  onSelect: (keys: string[]) => void;
}

export function FeedSportsBar({ selected, availableSports, onSelect }: FeedSportsBarProps) {
  const { labelFor } = useAffinityGroups();
  const [open, setOpen] = useState(false);

  // `availableSports` já vem do banco (feed_home_available_sports) na ordem da
  // taxonomia, e é ele quem manda: mostra só grupo com conteúdo pro usuário.
  const tabs = availableSports.filter(Boolean).map((key) => ({ key, label: labelFor(key) }));
  const allSelected = selected.length === 0;
  const selectedLabel =
    selected.length === 1
      ? tabs.find((tab) => tab.key === selected[0])?.label ?? 'Tudo'
      : selected.length > 1
        ? `${selected.length} modalidades`
        : 'Tudo';

  function toggleSport(key: string) {
    onSelect(selected.includes(key) ? selected.filter((sport) => sport !== key) : [...selected, key]);
  }

  return (
    <>
      <div className="flex justify-center px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-4 font-sans text-label text-white backdrop-blur-sm transition-opacity active:opacity-70"
        >
          {selectedLabel}
          <ChevronDown size={16} aria-hidden />
        </button>
      </div>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filtrar feed"
        description="Você pode escolher mais de uma modalidade."
      >
        <div className="px-5 pb-6 pt-1">
          <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface/40">
            <button
              type="button"
              onClick={() => onSelect([])}
              className="flex min-h-[52px] w-full items-center justify-between px-4 text-left transition-colors active:bg-surface-container-high"
            >
              <span className="font-sans text-body text-on-surface">Tudo</span>
              {allSelected && <Check size={20} className="text-primary" aria-label="Selecionado" />}
            </button>
            {tabs.map((tab) => {
              const active = selected.includes(tab.key);
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => toggleSport(tab.key)}
                  className="flex min-h-[52px] w-full items-center justify-between px-4 text-left transition-colors active:bg-surface-container-high"
                >
                  <span className="font-sans text-body text-on-surface">{tab.label}</span>
                  {active && <Check size={20} className="text-primary" aria-label="Selecionado" />}
                </button>
              );
            })}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
