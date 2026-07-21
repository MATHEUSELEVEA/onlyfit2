import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Plus, Search, Trash2, UtensilsCrossed } from 'lucide-react';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { useTranslation } from '@/i18n/I18nProvider';
import type { OfferingConfigProps } from './OfferingConfigProps';
import {
  useDietOfferingTemplate,
  useNutritionFoodSearch,
  useSaveDietOfferingContent,
  type NutritionFood,
} from './useOfferingContent';

type DietItemDraft = {
  localId: string;
  foodId: string;
  name: string;
  quantityG: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  notes: string;
};

type DietMealDraft = {
  localId: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_workout' | 'post_workout';
  title: string;
  targetTime: string;
  items: DietItemDraft[];
};

const MEAL_TYPES: DietMealDraft['mealType'][] = ['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout'];

const storedUuid = (settings: Record<string, unknown>, key: string): string | null => {
  const value = settings[key];
  return typeof value === 'string' && value ? value : null;
};

const round = (value: number): number => Math.round(value * 10) / 10;

function defaultMeal(mealType: DietMealDraft['mealType'], title: string, targetTime: string): DietMealDraft {
  return { localId: crypto.randomUUID(), mealType, title, targetTime, items: [] };
}

function foodToDraft(food: NutritionFood): DietItemDraft {
  const quantity = food.servingSizeG && food.servingSizeG > 0 ? food.servingSizeG : 100;
  const factor = quantity / 100;
  return {
    localId: crypto.randomUUID(),
    foodId: food.id,
    name: food.name,
    quantityG: String(quantity),
    kcal: round((food.kcalPer100g ?? 0) * factor),
    proteinG: round((food.proteinPer100g ?? 0) * factor),
    carbsG: round((food.carbsPer100g ?? 0) * factor),
    fatG: round((food.fatPer100g ?? 0) * factor),
    fiberG: round((food.fiberPer100g ?? 0) * factor),
    notes: '',
  };
}

export function StandaloneDietConfig({ offering }: OfferingConfigProps) {
  const { t } = useTranslation();
  const initialTemplateId = storedUuid(offering.settings, 'diet_template_id');
  const templateQuery = useDietOfferingTemplate(initialTemplateId);
  const saveMutation = useSaveDietOfferingContent(offering.id);
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId);
  const [loadedTemplateId, setLoadedTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState(offering.name);
  const [objective, setObjective] = useState('');
  const [targetCalories, setTargetCalories] = useState('');
  const [targetProtein, setTargetProtein] = useState('');
  const [targetCarbs, setTargetCarbs] = useState('');
  const [targetFats, setTargetFats] = useState('');
  const [meals, setMeals] = useState<DietMealDraft[]>([
    defaultMeal('breakfast', t('offer.diet.meal.breakfast'), '07:30'),
    defaultMeal('lunch', t('offer.diet.meal.lunch'), '12:30'),
    defaultMeal('dinner', t('offer.diet.meal.dinner'), '20:00'),
  ]);
  const [searchMealId, setSearchMealId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const foodSearch = useNutritionFoodSearch(search, Boolean(searchMealId));

  useEffect(() => {
    const template = templateQuery.data;
    if (!template || loadedTemplateId === template.id) return;
    // The query result is the external source used to hydrate this editable draft once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadedTemplateId(template.id);
    setTemplateId(template.id);
    setTitle(template.title);
    setObjective(template.objective);
    setTargetCalories(template.targetCalories === null ? '' : String(template.targetCalories));
    setTargetProtein(template.targetProteinG === null ? '' : String(template.targetProteinG));
    setTargetCarbs(template.targetCarbsG === null ? '' : String(template.targetCarbsG));
    setTargetFats(template.targetFatsG === null ? '' : String(template.targetFatsG));
    setMeals(template.meals.map((meal) => ({
      localId: crypto.randomUUID(),
      mealType: meal.mealType as DietMealDraft['mealType'],
      title: meal.title,
      targetTime: meal.targetTime,
      items: meal.items.flatMap((item) => item.foodId ? [{
        localId: crypto.randomUUID(),
        foodId: item.foodId,
        name: item.name,
        quantityG: String(item.quantityG),
        kcal: item.kcal ?? 0,
        proteinG: item.proteinG ?? 0,
        carbsG: item.carbsG ?? 0,
        fatG: item.fatG ?? 0,
        fiberG: item.fiberG ?? 0,
        notes: item.notes,
      }] : []),
    })));
  }, [loadedTemplateId, templateQuery.data]);

  const totals = useMemo(() => meals.flatMap((meal) => meal.items).reduce((sum, item) => ({
    kcal: sum.kcal + item.kcal,
    protein: sum.protein + item.proteinG,
    carbs: sum.carbs + item.carbsG,
    fats: sum.fats + item.fatG,
  }), { kcal: 0, protein: 0, carbs: 0, fats: 0 }), [meals]);

  const isReady = title.trim().length >= 3
    && objective.trim().length > 0
    && meals.length >= 3
    && meals.every((meal) => meal.title.trim() && meal.items.length > 0)
    && (Number(targetCalories) > 0 || totals.kcal > 0)
    && (Number(targetProtein) > 0 || totals.protein >= 35);

  function updateMeal(localId: string, patch: Partial<DietMealDraft>) {
    setMeals((current) => current.map((meal) => meal.localId === localId ? { ...meal, ...patch } : meal));
  }

  function moveMeal(index: number, direction: -1 | 1) {
    setMeals((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addFood(mealId: string, food: NutritionFood) {
    setMeals((current) => current.map((meal) => meal.localId === mealId && !meal.items.some((item) => item.foodId === food.id)
      ? { ...meal, items: [...meal.items, foodToDraft(food)] }
      : meal));
    setSearch('');
    setSearchMealId(null);
  }

  function updateItem(mealId: string, itemId: string, patch: Partial<DietItemDraft>) {
    setMeals((current) => current.map((meal) => meal.localId === mealId ? {
      ...meal,
      items: meal.items.map((item) => item.localId === itemId ? { ...item, ...patch } : item),
    } : meal));
  }

  function updateQuantity(mealId: string, item: DietItemDraft, nextValue: string) {
    const previous = Number(item.quantityG);
    const next = Number(nextValue);
    if (!Number.isFinite(next) || next < 0 || !Number.isFinite(previous) || previous <= 0) {
      updateItem(mealId, item.localId, { quantityG: nextValue });
      return;
    }
    const factor = next / previous;
    updateItem(mealId, item.localId, {
      quantityG: nextValue,
      kcal: round(item.kcal * factor),
      proteinG: round(item.proteinG * factor),
      carbsG: round(item.carbsG * factor),
      fatG: round(item.fatG * factor),
      fiberG: round(item.fiberG * factor),
    });
  }

  function save() {
    if (!isReady) {
      setError(t('offer.diet.error.incomplete'));
      return;
    }
    const optionalNumber = (value: string): number | null => value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
    setError(null);
    setFeedback(null);
    saveMutation.mutate({
      templateId,
      title: title.trim(),
      objective: objective.trim(),
      targetCalories: optionalNumber(targetCalories),
      targetProteinG: optionalNumber(targetProtein),
      targetCarbsG: optionalNumber(targetCarbs),
      targetFatsG: optionalNumber(targetFats),
      meals: meals.map((meal, orderIndex) => ({
        meal_type: meal.mealType,
        title: meal.title.trim(),
        target_time: meal.targetTime || null,
        order_index: orderIndex,
        items: meal.items.map((item, itemIndex) => ({
          food_id: item.foodId,
          custom_food_name: null,
          quantity_g: Math.max(0, Number(item.quantityG) || 0),
          quantity_unit: 'grama',
          quantity_value: Math.max(0, Number(item.quantityG) || 0),
          kcal: item.kcal,
          protein_g: item.proteinG,
          carbs_g: item.carbsG,
          fat_g: item.fatG,
          fiber_g: item.fiberG,
          notes: item.notes.trim() || null,
          order_index: itemIndex,
        })),
      })),
    }, {
      onSuccess: (savedTemplateId) => {
        setTemplateId(savedTemplateId);
        setFeedback(t('offer.diet.saved'));
      },
      onError: () => setError(t('offer.diet.error.save')),
    });
  }

  if (templateQuery.isLoading) {
    return <div className="flex min-h-32 items-center justify-center rounded-2xl bg-surface-container"><Loader2 size={24} className="animate-spin text-primary" aria-label={t('common.loading')} /></div>;
  }

  return (
    <div className="space-y-7 rounded-2xl bg-surface-container p-4">
      <section aria-labelledby="diet-builder-heading">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><UtensilsCrossed size={20} aria-hidden /></span>
          <div><h4 id="diet-builder-heading" className="font-sans text-title text-on-surface">{t('offer.diet.title')}</h4><p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('offer.diet.hint')}</p></div>
        </div>
        <div className="mt-5 space-y-4">
          <TextField label={t('offer.diet.field.title')} value={title} maxLength={96} onChange={(event) => setTitle(event.target.value)} />
          <TextAreaField label={t('offer.diet.field.objective')} value={objective} rows={2} onChange={(event) => setObjective(event.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label={t('offer.diet.field.calories')} value={targetCalories} inputMode="numeric" onChange={(event) => setTargetCalories(event.target.value)} />
            <TextField label={t('offer.diet.field.protein')} value={targetProtein} inputMode="numeric" onChange={(event) => setTargetProtein(event.target.value)} />
            <TextField label={t('offer.diet.field.carbs')} value={targetCarbs} inputMode="numeric" onChange={(event) => setTargetCarbs(event.target.value)} />
            <TextField label={t('offer.diet.field.fats')} value={targetFats} inputMode="numeric" onChange={(event) => setTargetFats(event.target.value)} />
          </div>
        </div>
      </section>

      <section className="border-t border-outline-variant/25 pt-6" aria-labelledby="diet-meals-heading">
        <div className="flex items-start justify-between gap-3"><div><h4 id="diet-meals-heading" className="font-sans text-title text-on-surface">{t('offer.diet.meals.title')}</h4><p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('offer.diet.meals.hint')}</p></div><button type="button" onClick={() => setMeals((current) => [...current, defaultMeal('snack', t('offer.diet.meal.snack'), '')])} className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 font-sans text-counter text-primary"><Plus size={16} aria-hidden />{t('offer.diet.meals.add')}</button></div>
        <div className="mt-4 space-y-3">
          {meals.map((meal, index) => (
            <article key={meal.localId} className="rounded-xl bg-surface-container-low p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-sans text-counter text-primary">{index + 1}</span>
                <select value={meal.mealType} onChange={(event) => updateMeal(meal.localId, { mealType: event.target.value as DietMealDraft['mealType'] })} className="min-h-10 min-w-0 flex-1 rounded-lg bg-surface px-2 font-sans text-label text-on-surface outline-none ring-1 ring-outline-variant/40 focus:ring-primary">{MEAL_TYPES.map((type) => <option key={type} value={type}>{t(`offer.diet.meal.${type}`)}</option>)}</select>
                <span className="flex"><button type="button" disabled={index === 0} onClick={() => moveMeal(index, -1)} aria-label={t('offer.workout.moveUp')} className="flex h-10 w-8 items-center justify-center text-on-surface-variant disabled:opacity-30"><ChevronUp size={17} aria-hidden /></button><button type="button" disabled={index === meals.length - 1} onClick={() => moveMeal(index, 1)} aria-label={t('offer.workout.moveDown')} className="flex h-10 w-8 items-center justify-center text-on-surface-variant disabled:opacity-30"><ChevronDown size={17} aria-hidden /></button></span>
                {meals.length > 3 && <button type="button" onClick={() => setMeals((current) => current.filter((item) => item.localId !== meal.localId))} aria-label={t('offer.diet.meals.remove')} className="flex h-10 w-10 items-center justify-center text-error"><Trash2 size={17} aria-hidden /></button>}
              </div>
              <div className="mt-3 grid grid-cols-[1fr_112px] gap-2"><CompactInput label={t('offer.diet.meals.name')} value={meal.title} onChange={(value) => updateMeal(meal.localId, { title: value })} /><label className="font-sans text-body-sm text-on-surface-variant">{t('offer.diet.meals.time')}<input type="time" value={meal.targetTime} onChange={(event) => updateMeal(meal.localId, { targetTime: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg bg-surface px-2 font-sans text-body text-on-surface outline-none ring-1 ring-outline-variant/40 focus:ring-primary" /></label></div>
              <ul className="mt-3 space-y-2">
                {meal.items.map((item) => <li key={item.localId} className="rounded-lg bg-surface p-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="font-sans text-label text-on-surface">{item.name}</p><p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{round(item.kcal)} kcal · P {round(item.proteinG)}g · C {round(item.carbsG)}g · G {round(item.fatG)}g</p></div><button type="button" onClick={() => updateMeal(meal.localId, { items: meal.items.filter((candidate) => candidate.localId !== item.localId) })} aria-label={t('offer.diet.items.remove')} className="flex h-10 w-10 items-center justify-center text-error"><Trash2 size={16} aria-hidden /></button></div><div className="mt-2 grid grid-cols-[112px_1fr] gap-2"><CompactInput label={t('offer.diet.items.quantity')} value={item.quantityG} inputMode="decimal" onChange={(value) => updateQuantity(meal.localId, item, value)} /><CompactInput label={t('offer.diet.items.notes')} value={item.notes} onChange={(value) => updateItem(meal.localId, item.localId, { notes: value })} /></div></li>)}
              </ul>
              <button type="button" onClick={() => { setSearchMealId(searchMealId === meal.localId ? null : meal.localId); setSearch(''); }} className="mt-3 flex min-h-11 items-center gap-2 font-sans text-label text-primary"><Plus size={17} aria-hidden />{t('offer.diet.items.add')}</button>
              {searchMealId === meal.localId && <div className="mt-2"><label className="flex min-h-11 items-center gap-2 rounded-xl bg-surface px-3 ring-1 ring-outline-variant/40 focus-within:ring-primary"><Search size={17} className="text-on-surface-variant" aria-hidden /><span className="sr-only">{t('offer.diet.items.search')}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('offer.diet.items.search')} className="min-w-0 flex-1 bg-transparent font-sans text-body text-on-surface outline-none placeholder:text-on-surface-variant/60" />{foodSearch.isFetching && <Loader2 size={16} className="animate-spin text-primary" aria-hidden />}</label>{(foodSearch.data ?? []).length > 0 && <div className="mt-2 max-h-52 overflow-y-auto rounded-xl bg-surface p-1">{foodSearch.data?.map((food) => <button key={food.id} type="button" onClick={() => addFood(meal.localId, food)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left hover:bg-surface-container-high"><span className="min-w-0 flex-1"><span className="block truncate font-sans text-label text-on-surface">{food.name}</span><span className="block truncate font-sans text-body-sm text-on-surface-variant">{food.brand || t('offer.diet.items.foodDatabase')}</span></span><Plus size={16} className="text-primary" aria-hidden /></button>)}</div>}</div>}
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-outline-variant/25 pt-5"><h4 className="font-sans text-label text-on-surface">{t('offer.diet.summary')}</h4><div className="mt-3 grid grid-cols-4 gap-2"><Metric value={round(totals.kcal)} label="kcal" /><Metric value={round(totals.protein)} label="P (g)" /><Metric value={round(totals.carbs)} label="C (g)" /><Metric value={round(totals.fats)} label="G (g)" /></div></section>
      {error && <p role="alert" className="font-sans text-body-sm text-error">{error}</p>}
      {feedback && <p role="status" className="font-sans text-body-sm text-primary">{feedback}</p>}
      <button type="button" disabled={saveMutation.isPending || !isReady} onClick={save} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-sans text-label text-on-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40">{saveMutation.isPending && <Loader2 size={18} className="animate-spin" aria-hidden />}{saveMutation.isPending ? t('profile.business.offers.saving') : t('offer.diet.save')}</button>
    </div>
  );
}

function CompactInput({ label, value, onChange, inputMode }: { label: string; value: string; onChange: (value: string) => void; inputMode?: 'numeric' | 'decimal' }) { return <label className="min-w-0 font-sans text-body-sm text-on-surface-variant"><span className="block truncate">{label}</span><input value={value} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg bg-surface px-2 font-sans text-body text-on-surface outline-none ring-1 ring-outline-variant/40 focus:ring-primary" /></label>; }
function Metric({ value, label }: { value: number; label: string }) { return <div><p className="font-sans text-label tabular-nums text-on-surface">{value}</p><p className="font-sans text-counter text-on-surface-variant">{label}</p></div>; }
