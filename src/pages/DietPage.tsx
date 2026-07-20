import { useMemo, useState } from 'react';
import { Check, ChevronRight, Clock3, MoreHorizontal, UtensilsCrossed } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';

type MealStatus = 'done' | 'next' | 'later' | 'skipped';
type Meal = { id: string; time: string; title: string; items: string[]; kcal: number; protein: number; status: MealStatus };

const initialMeals: Meal[] = [
  { id: 'breakfast', time: '07:30', title: 'Café da manhã', items: ['Ovos mexidos', 'Pão integral', 'Mamão'], kcal: 420, protein: 28, status: 'done' },
  { id: 'lunch', time: '12:30', title: 'Almoço', items: ['Frango grelhado', 'Arroz', 'Legumes'], kcal: 610, protein: 46, status: 'next' },
  { id: 'snack', time: '16:30', title: 'Lanche', items: ['Iogurte grego', 'Banana', 'Aveia'], kcal: 310, protein: 21, status: 'later' },
  { id: 'dinner', time: '20:00', title: 'Jantar', items: ['Peixe', 'Batata-doce', 'Salada'], kcal: 520, protein: 39, status: 'later' },
];

export function DietPage() {
  const [meals, setMeals] = useState(initialMeals);
  const [selected, setSelected] = useState<Meal | null>(null);
  const [showSubstitutions, setShowSubstitutions] = useState(false);
  const completed = meals.filter((meal) => meal.status === 'done').length;
  const calories = useMemo(() => meals.filter((meal) => meal.status === 'done').reduce((sum, meal) => sum + meal.kcal, 0), [meals]);
  const openMeal = (meal: Meal) => { setShowSubstitutions(false); setSelected(meal); };
  const confirmMeal = (id: string) => { setMeals((current) => current.map((meal) => meal.id === id ? { ...meal, status: meal.status === 'done' ? 'next' : 'done' } : meal)); setSelected(null); setShowSubstitutions(false); };
  const next = meals.find((meal) => meal.status === 'next') ?? meals.find((meal) => meal.status === 'later');

  return <div className="flex h-full flex-col overflow-y-auto bg-background pb-6">
    <PageTopBar title="Dieta" backFallback="/meu-fit" />
    <main className="mx-auto w-full max-w-[720px] px-5 py-5">
      <section className="rounded-2xl border border-outline-variant/40 bg-surface-container p-5"><div className="flex items-start justify-between"><div><p className="font-sans text-counter text-primary">HOJE</p><h1 className="mt-1 font-sans text-title-lg text-on-surface">Seu plano, no seu ritmo</h1><p className="mt-1 font-sans text-body-sm text-on-surface-variant">{completed} de {meals.length} refeições registradas</p></div><div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-primary/20"><span className="font-sans text-label text-primary">{Math.round(completed / meals.length * 100)}%</span></div></div><div className="mt-5 grid grid-cols-3 gap-2 border-t border-outline-variant/30 pt-4"><Metric value={`${calories}`} label="kcal" /><Metric value={`${meals.filter((meal) => meal.status === 'done').reduce((sum, meal) => sum + meal.protein, 0)}g`} label="proteína" /><Metric value="2.040" label="meta kcal" /></div></section>
      {next ? <section className="mt-6"><p className="font-sans text-counter text-primary">PRÓXIMA REFEIÇÃO · {next.time}</p><button type="button" onClick={() => openMeal(next)} className="mt-2 w-full rounded-2xl border border-outline-variant/40 bg-surface-container p-5 text-left transition-transform active:scale-[0.99]"><div className="flex items-start justify-between"><div><h2 className="font-sans text-title-lg text-on-surface">{next.title}</h2><p className="mt-1 font-sans text-body-sm text-on-surface-variant">{next.items.join(' · ')}</p></div><span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary"><UtensilsCrossed size={18} /></span></div><div className="mt-5 flex items-center justify-between"><span className="font-sans text-label text-on-surface">{next.kcal} kcal · {next.protein}g proteína</span><span className="flex items-center gap-1 font-sans text-label text-primary">Ver refeição <ChevronRight size={17} /></span></div></button></section> : null}
      <section className="mt-7"><div className="flex items-center justify-between"><h2 className="font-sans text-title text-on-surface">Seu dia</h2><button type="button" className="font-sans text-counter text-primary">Plano</button></div><div className="mt-3 space-y-2">{meals.map((meal) => <button key={meal.id} type="button" onClick={() => openMeal(meal)} className="flex min-h-[68px] w-full items-center gap-3 rounded-xl border border-outline-variant/35 bg-surface-container px-3 text-left"><span className={clsx('flex h-9 w-9 items-center justify-center rounded-full', meal.status === 'done' ? 'bg-primary text-on-primary' : meal.status === 'next' ? 'border border-primary text-primary' : 'bg-surface-container-high text-on-surface-variant')}>{meal.status === 'done' ? <Check size={17} /> : <Clock3 size={17} />}</span><span className="min-w-0 flex-1"><span className="block font-sans text-label text-on-surface">{meal.title}</span><span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">{meal.time} · {meal.kcal} kcal</span></span><ChevronRight size={18} className="text-on-surface-variant" /></button>)}</div></section>
    </main>
    <BottomSheet open={Boolean(selected)} onClose={() => { setSelected(null); setShowSubstitutions(false); }} title={selected?.title ?? ''} description={selected ? `${selected.time} · ${selected.kcal} kcal · ${selected.protein}g de proteína` : ''}><div className="px-5 pb-6"><div className="rounded-xl bg-surface-container p-4"><p className="font-sans text-counter text-on-surface-variant">O que comer</p><ul className="mt-3 space-y-2">{selected?.items.map((item) => <li key={item} className="flex items-center gap-2 font-sans text-body text-on-surface"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{item}</li>)}</ul></div><button type="button" onClick={() => setShowSubstitutions((current) => !current)} aria-expanded={showSubstitutions} className="mt-4 flex min-h-11 items-center gap-2 font-sans text-label text-primary"><MoreHorizontal size={18} /> {showSubstitutions ? 'Ocultar substituições' : 'Ver substituições'}</button>{showSubstitutions ? <div className="rounded-xl border border-outline-variant/35 bg-surface-container px-4 py-3"><p className="font-sans text-label text-on-surface">Nenhuma substituição foi configurada para esta refeição.</p><p className="mt-1 font-sans text-body-sm text-on-surface-variant">Peça uma opção ao profissional responsável pelo seu plano.</p></div> : null}<button type="button" onClick={() => selected && confirmMeal(selected.id)} className="mt-4 min-h-12 w-full rounded-xl bg-primary font-sans text-label text-on-primary">{selected?.status === 'done' ? 'Desfazer confirmação' : 'Confirmar refeição'}</button></div></BottomSheet>
  </div>;
}

function Metric({ value, label }: { value: string; label: string }) { return <div><p className="font-sans text-label text-on-surface">{value}</p><p className="mt-0.5 font-sans text-counter text-on-surface-variant">{label}</p></div>; }
