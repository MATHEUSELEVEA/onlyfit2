import { useState } from 'react';
import { Check, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { affinityIcon, useAffinityGroups } from '@/lib/sports';

interface FeedSportsBarProps {
  selected: string[];
  onSelect: (keys: string[]) => void;
}

export function FeedSportsBar({ selected, onSelect }: FeedSportsBarProps) {
  // A lista é a taxonomia inteira da plataforma (feed_affinity_groups): todos os
  // grupos ativos aparecem, mesmo sem conteúdo ou sem o usuário seguir ninguém.
  const { groups } = useAffinityGroups();
  const [open, setOpen] = useState(false);
  // Rascunho local: a seleção só vira filtro quando o usuário toca em "Aplicar".
  const [draft, setDraft] = useState<string[]>(selected);

  const allSelected = selected.length === 0;
  const draftAll = draft.length === 0;

  // Ao abrir, parte sempre do filtro em vigor.
  function openSheet() {
    setDraft(selected);
    setOpen(true);
  }

  function toggle(key: string) {
    setDraft((current) =>
      current.includes(key) ? current.filter((sport) => sport !== key) : [...current, key],
    );
  }

  function apply() {
    onSelect(draft);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Filtrar por grupo de afinidade"
        className="feed-ctrl-filter absolute right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/25 text-white backdrop-blur-sm transition-transform active:scale-95"
      >
        <SlidersHorizontal size={20} aria-hidden />
        {!allSelected && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-black/40" aria-hidden />}
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filtrar por grupo de afinidade"
        description="Escolha um ou mais grupos e toque em Aplicar."
      >
        <div className="flex flex-col gap-2 px-5 pb-4 pt-1">
          <button
            type="button"
            onClick={() => setDraft([])}
            aria-pressed={draftAll}
            className={clsx(
              'flex min-h-[60px] w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors',
              draftAll
                ? 'border-primary bg-primary/10'
                : 'border-outline-variant/30 bg-surface/40 active:bg-surface-container-high',
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-high">
              <LayoutGrid size={20} className="text-on-surface" aria-hidden />
            </span>
            <span className="flex-1 font-sans text-body text-on-surface">Tudo</span>
            {draftAll && <Check size={20} className="text-primary" aria-label="Selecionado" />}
          </button>

          {groups.map((group) => {
            const Icon = affinityIcon(group.icon);
            const active = draft.includes(group.key);
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => toggle(group.key)}
                aria-pressed={active}
                className={clsx(
                  'flex min-h-[60px] w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors',
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-outline-variant/30 bg-surface/40 active:bg-surface-container-high',
                )}
              >
                <span
                  className={clsx(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br',
                    group.accent,
                  )}
                >
                  <Icon size={20} className="text-on-surface" aria-hidden />
                </span>
                <span className="flex-1 font-sans text-body text-on-surface">{group.label}</span>
                {active && <Check size={20} className="text-primary" aria-label="Selecionado" />}
              </button>
            );
          })}
        </div>

        <div className="sticky bottom-0 mt-auto border-t border-outline-variant/30 bg-background px-5 pb-6 pt-3">
          <button
            type="button"
            onClick={apply}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-primary px-6 font-sans text-label text-on-primary transition-transform active:scale-[0.98]"
          >
            {draftAll ? 'Aplicar (Tudo)' : `Aplicar filtro (${draft.length})`}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
