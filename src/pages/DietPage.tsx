import { useMemo, useState } from 'react';
import { ChevronRight, Clock3, Loader2, UtensilsCrossed } from 'lucide-react';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useTranslation } from '@/i18n/I18nProvider';
import { useStudentDietPlan, type StudentDietMeal } from '@/features/diet/useStudentDietPlan';

const round = (value: number): number => Math.round(value);

function nextMeal(meals: StudentDietMeal[]): StudentDietMeal | null {
  const current = new Date();
  const now = current.getHours() * 60 + current.getMinutes();
  return meals.find((meal) => {
    if (!meal.targetTime) return false;
    const [hours, minutes] = meal.targetTime.split(':').map(Number);
    return hours * 60 + minutes >= now;
  }) ?? meals[0] ?? null;
}

export function DietPage() {
  const { t } = useTranslation();
  const { data: plan, isLoading, isError } = useStudentDietPlan();
  const [selected, setSelected] = useState<StudentDietMeal | null>(null);
  const totals = useMemo(() => (plan?.meals ?? []).flatMap((meal) => meal.items).reduce((sum, item) => ({
    kcal: sum.kcal + item.kcal,
    protein: sum.protein + item.proteinG,
    carbs: sum.carbs + item.carbsG,
    fats: sum.fats + item.fatG,
  }), { kcal: 0, protein: 0, carbs: 0, fats: 0 }), [plan]);
  const upcoming = plan ? nextMeal(plan.meals) : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background pb-6">
      <PageTopBar title={t('meufit.diet.title')} backFallback="/meu-fit" />
      <main className="mx-auto w-full max-w-[720px] px-5 py-5">
        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center"><Loader2 size={28} className="animate-spin text-primary" aria-label={t('common.loading')} /></div>
        ) : isError ? (
          <p role="alert" className="rounded-xl bg-error-container p-4 font-sans text-body text-on-error-container">{t('diet.loadError')}</p>
        ) : !plan ? (
          <section className="flex min-h-[360px] flex-col items-center justify-center text-center">
            <UtensilsCrossed size={40} className="text-primary" aria-hidden />
            <h1 className="mt-4 font-sans text-title text-on-surface">{t('diet.emptyTitle')}</h1>
            <p className="mt-2 max-w-sm font-sans text-body-sm text-on-surface-variant">{t('diet.emptyDescription')}</p>
          </section>
        ) : (
          <>
            <section className="rounded-2xl bg-surface-container p-5">
              <p className="font-sans text-counter text-primary">{t('diet.activePlan')}</p>
              <h1 className="mt-1 font-sans text-title-lg text-on-surface">{plan.title}</h1>
              {plan.objective && <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{plan.objective}</p>}
              <div className="mt-5 grid grid-cols-4 gap-2 border-t border-outline-variant/30 pt-4">
                <Metric value={`${round(plan.targetCalories ?? totals.kcal)}`} label="kcal" />
                <Metric value={`${round(plan.targetProteinG ?? totals.protein)}g`} label={t('diet.protein')} />
                <Metric value={`${round(plan.targetCarbsG ?? totals.carbs)}g`} label={t('diet.carbs')} />
                <Metric value={`${round(plan.targetFatsG ?? totals.fats)}g`} label={t('diet.fats')} />
              </div>
            </section>

            {upcoming && (
              <section className="mt-6">
                <p className="font-sans text-counter text-primary">{t('diet.nextMeal')}{upcoming.targetTime ? ` · ${upcoming.targetTime}` : ''}</p>
                <button type="button" onClick={() => setSelected(upcoming)} className="mt-2 w-full rounded-2xl bg-surface-container p-5 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-sans text-title-lg text-on-surface">{upcoming.title}</h2><p className="mt-1 line-clamp-2 font-sans text-body-sm text-on-surface-variant">{upcoming.items.map((item) => item.name).join(' · ')}</p></div><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary"><UtensilsCrossed size={18} aria-hidden /></span></div>
                  <div className="mt-5 flex items-center justify-between gap-3"><span className="font-sans text-label text-on-surface">{round(upcoming.items.reduce((sum, item) => sum + item.kcal, 0))} kcal</span><span className="flex items-center gap-1 font-sans text-label text-primary">{t('diet.viewMeal')}<ChevronRight size={17} aria-hidden /></span></div>
                </button>
              </section>
            )}

            <section className="mt-7">
              <h2 className="font-sans text-title text-on-surface">{t('diet.meals')}</h2>
              <div className="mt-3 space-y-2">
                {plan.meals.map((meal) => (
                  <button key={meal.id} type="button" onClick={() => setSelected(meal)} className="flex min-h-[68px] w-full items-center gap-3 rounded-xl bg-surface-container px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant"><Clock3 size={17} aria-hidden /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-sans text-label text-on-surface">{meal.title}</span><span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">{meal.targetTime || t('diet.noTime')} · {meal.items.length} {meal.items.length === 1 ? t('diet.item') : t('diet.items')}</span></span>
                    <ChevronRight size={18} className="text-on-surface-variant" aria-hidden />
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      <BottomSheet open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title ?? ''} description={selected?.targetTime ?? undefined}>
        <div className="px-5 pb-6">
          <ul className="space-y-2">
            {selected?.items.map((item) => (
              <li key={item.id} className="rounded-xl bg-surface-container p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-sans text-label text-on-surface">{item.name}</p><p className="mt-1 font-sans text-body-sm text-on-surface-variant">{item.quantityValue ?? item.quantityG} {item.quantityValue !== null ? item.quantityUnit : 'g'}</p></div><span className="font-sans text-counter text-on-surface-variant">{round(item.kcal)} kcal</span></div>
                <p className="mt-3 font-sans text-body-sm text-on-surface-variant">P {round(item.proteinG)}g · C {round(item.carbsG)}g · G {round(item.fatG)}g</p>
                {item.notes && <p className="mt-2 border-t border-outline-variant/25 pt-2 font-sans text-body-sm text-on-surface">{item.notes}</p>}
              </li>
            ))}
          </ul>
        </div>
      </BottomSheet>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) { return <div className="min-w-0"><p className="truncate font-sans text-label text-on-surface">{value}</p><p className="mt-0.5 truncate font-sans text-counter text-on-surface-variant">{label}</p></div>; }
