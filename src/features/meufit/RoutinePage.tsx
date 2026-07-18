import { useState } from 'react';
import { Check, Clock3, Droplets, Pill, Plus, Salad, type LucideIcon } from 'lucide-react';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useTranslation } from '@/i18n/I18nProvider';

type RoutineKind = 'water' | 'supplement' | 'meal' | 'medicine';

interface RoutineItem {
  id: number;
  title: string;
  time: string;
  kind: RoutineKind;
}

const ROUTINE_ICONS: Record<RoutineKind, LucideIcon> = {
  water: Droplets,
  supplement: Pill,
  meal: Salad,
  medicine: Pill,
};

export function RoutinePage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('08:00');
  const [kind, setKind] = useState<RoutineKind>('water');

  function addItem() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setItems((current) => [
      ...current,
      { id: Date.now(), title: trimmedTitle, time, kind },
    ]);
    setTitle('');
    setTime('08:00');
    setKind('water');
    setOpen(false);
  }

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <PageTopBar title={t('meufit.routine.title')} backFallback="/meu-fit" />
      <div className="mx-auto w-full max-w-[720px] px-6 pt-6">
        {items.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Clock3 size={28} aria-hidden />
            </span>
            <h2 className="mt-4 font-sans text-title text-on-surface">{t('meufit.routine.emptyTitle')}</h2>
            <p className="mt-1 max-w-xs font-sans text-body-sm text-on-surface-variant">
              {t('meufit.routine.emptyDescription')}
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface">
            {items
              .slice()
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((item) => {
                const Icon = ROUTINE_ICONS[item.kind];
                return (
                  <li key={item.id} className="flex min-h-[64px] items-center gap-3 border-t border-outline-variant/25 px-4 py-3 first:border-t-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon size={19} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-sans text-body font-medium text-on-surface">{item.title}</span>
                      <span className="block font-sans text-body-sm text-on-surface-variant">{item.time}</span>
                    </span>
                    <Check size={20} className="text-outline" aria-hidden />
                  </li>
                );
              })}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-primary font-sans text-label text-on-primary transition-opacity active:opacity-90"
        >
          <Plus size={20} aria-hidden />
          {t('meufit.routine.add')}
        </button>
      </div>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('meufit.routine.add')}>
        <form
          className="space-y-5 px-5 pb-6 pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            addItem();
          }}
        >
          <label className="block">
            <span className="font-sans text-label text-on-surface">{t('meufit.routine.reminder')}</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('meufit.routine.placeholder')}
              className="mt-2 min-h-[48px] w-full rounded-lg border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
              required
            />
          </label>
          <label className="block">
            <span className="font-sans text-label text-on-surface">{t('meufit.routine.time')}</span>
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="mt-2 min-h-[48px] w-full rounded-lg border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <div>
            <span className="font-sans text-label text-on-surface">{t('meufit.routine.type')}</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['water', 'supplement', 'meal', 'medicine'] as const).map((option) => {
                const Icon = ROUTINE_ICONS[option];
                const active = kind === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setKind(option)}
                    className={active ? 'flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 font-sans text-label text-primary' : 'flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-outline-variant/50 bg-surface font-sans text-label text-on-surface-variant'}
                  >
                    <Icon size={18} aria-hidden />
                    {t(`meufit.routine.kind.${option}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <button type="submit" className="min-h-[48px] w-full rounded-lg bg-primary font-sans text-label text-on-primary">
            {t('meufit.routine.save')}
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
