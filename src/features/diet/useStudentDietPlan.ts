import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export type StudentDietMealItem = {
  id: string;
  name: string;
  quantityG: number;
  quantityValue: number | null;
  quantityUnit: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  notes: string | null;
};

export type StudentDietMeal = {
  id: string;
  mealType: string;
  title: string;
  targetTime: string | null;
  items: StudentDietMealItem[];
};

export type StudentDietPlan = {
  id: string;
  title: string;
  objective: string | null;
  targetCalories: number | null;
  targetProteinG: number | null;
  targetCarbsG: number | null;
  targetFatsG: number | null;
  meals: StudentDietMeal[];
};

const numeric = (value: unknown): number => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

export function useStudentDietPlan() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['student-diet-plan', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async (): Promise<StudentDietPlan | null> => {
      const { data, error } = await supabase
        .from('diet_plans')
        .select('id,name,title,objective,target_calories,target_protein_g,target_carbs_g,target_fats_g,diet_plan_meals(id,meal_type,title,target_time,order_index,diet_plan_meal_items(id,food_id,custom_food_name,quantity_g,quantity_value,quantity_unit,kcal,protein_g,carbs_g,fat_g,notes,order_index,food:nutrition_foods(name)))')
        .eq('student_id', userId!)
        .eq('status', 'published')
        .eq('is_active', true)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        title: data.title || data.name,
        objective: data.objective,
        targetCalories: data.target_calories === null ? null : numeric(data.target_calories),
        targetProteinG: data.target_protein_g === null ? null : numeric(data.target_protein_g),
        targetCarbsG: data.target_carbs_g === null ? null : numeric(data.target_carbs_g),
        targetFatsG: data.target_fats_g === null ? null : numeric(data.target_fats_g),
        meals: [...(data.diet_plan_meals ?? [])]
          .sort((a, b) => a.order_index - b.order_index)
          .map((meal) => ({
            id: meal.id,
            mealType: meal.meal_type,
            title: meal.title || meal.meal_type,
            targetTime: meal.target_time?.slice(0, 5) ?? null,
            items: [...(meal.diet_plan_meal_items ?? [])]
              .sort((a, b) => a.order_index - b.order_index)
              .map((item) => ({
                id: item.id,
                name: item.custom_food_name || (item.food as { name?: string } | null)?.name || '',
                quantityG: numeric(item.quantity_g),
                quantityValue: item.quantity_value === null ? null : numeric(item.quantity_value),
                quantityUnit: item.quantity_unit ?? 'grama',
                kcal: numeric(item.kcal),
                proteinG: numeric(item.protein_g),
                carbsG: numeric(item.carbs_g),
                fatG: numeric(item.fat_g),
                notes: item.notes,
              })),
          })),
      };
    },
  });
}
