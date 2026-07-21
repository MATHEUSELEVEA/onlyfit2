import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { WorkoutPrescription } from './workoutPrescription';
import type { WorkoutTrainingType } from '@/features/training/useStudentWorkouts';

export type ExerciseLibraryItem = {
  id: string;
  name: string;
  muscles: string[];
  category: string | null;
  equipment: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
};

export type NutritionFood = {
  id: string;
  name: string;
  brand: string | null;
  servingSizeG: number | null;
  kcalPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
};

export type WorkoutOfferingTemplate = {
  id: string;
  title: string;
  description: string;
  trainingType: WorkoutTrainingType;
  prescription: WorkoutPrescription | null;
  exercises: Array<{
    id: string;
    exerciseId: string;
    name: string;
    muscle: string;
    videoUrl: string | null;
    sets: number;
    reps: string;
    restSeconds: number;
    notes: string;
  }>;
};

export type DietTemplateItem = {
  id: string;
  foodId: string | null;
  name: string;
  quantityG: number;
  quantityUnit: string;
  quantityValue: number | null;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  notes: string;
};

export type DietOfferingTemplate = {
  id: string;
  title: string;
  objective: string;
  targetCalories: number | null;
  targetProteinG: number | null;
  targetCarbsG: number | null;
  targetFatsG: number | null;
  meals: Array<{
    id: string;
    mealType: string;
    title: string;
    targetTime: string;
    items: DietTemplateItem[];
  }>;
};

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function useExerciseLibrarySearch(search: string, enabled = true) {
  const normalized = search.trim();
  return useQuery({
    queryKey: ['offering-exercise-search', normalized],
    enabled: enabled && normalized.length >= 2,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<ExerciseLibraryItem[]> => {
      const { data, error } = await supabase
        .from('exercise_library')
        .select('id,name_ptbr,primary_muscles,category,equipment,video_url,thumb_url')
        .ilike('name_ptbr', `%${normalized.replace(/[%_]/g, '')}%`)
        .order('name_ptbr')
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name_ptbr,
        muscles: row.primary_muscles ?? [],
        category: row.category,
        equipment: row.equipment,
        videoUrl: row.video_url,
        thumbnailUrl: row.thumb_url,
      }));
    },
  });
}

export function useNutritionFoodSearch(search: string, enabled = true) {
  const normalized = search.trim();
  return useQuery({
    queryKey: ['offering-food-search', normalized],
    enabled: enabled && normalized.length >= 2,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<NutritionFood[]> => {
      const { data, error } = await supabase
        .from('nutrition_foods')
        .select('id,name,brand,serving_size_g,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g')
        .ilike('name', `%${normalized.replace(/[%_]/g, '')}%`)
        .order('name')
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        brand: row.brand,
        servingSizeG: asNumber(row.serving_size_g),
        kcalPer100g: asNumber(row.kcal_per_100g),
        proteinPer100g: asNumber(row.protein_per_100g),
        carbsPer100g: asNumber(row.carbs_per_100g),
        fatPer100g: asNumber(row.fat_per_100g),
        fiberPer100g: asNumber(row.fiber_per_100g),
      }));
    },
  });
}

export function useWorkoutOfferingTemplate(workoutId: string | null) {
  return useQuery({
    queryKey: ['offering-workout-template', workoutId],
    enabled: Boolean(workoutId),
    queryFn: async (): Promise<WorkoutOfferingTemplate | null> => {
      const { data, error } = await supabase
        .from('workouts')
        .select('id,title,description,category,workout_exercises(id,exercise_id,exercise_name,muscle_group,pro_video_url,sets,reps,rest_seconds,notes,position),workout_prescriptions(modality,prescription)')
        .eq('id', workoutId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const rawPrescription = data.workout_prescriptions as
        | Array<{ modality: WorkoutTrainingType; prescription: WorkoutPrescription }>
        | { modality: WorkoutTrainingType; prescription: WorkoutPrescription }
        | null;
      const prescription = Array.isArray(rawPrescription) ? rawPrescription[0] : rawPrescription;
      const exercises = [...(data.workout_exercises ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      return {
        id: data.id,
        title: data.title,
        description: data.description ?? '',
        trainingType: (prescription?.modality ?? data.category ?? 'strength') as WorkoutTrainingType,
        prescription: prescription?.prescription ?? null,
        exercises: exercises.flatMap((exercise) => exercise.exercise_id ? [{
          id: exercise.id,
          exerciseId: exercise.exercise_id,
          name: exercise.exercise_name ?? '',
          muscle: exercise.muscle_group ?? '',
          videoUrl: exercise.pro_video_url,
          sets: exercise.sets ?? 1,
          reps: exercise.reps ?? '1',
          restSeconds: exercise.rest_seconds ?? 0,
          notes: exercise.notes ?? '',
        }] : []),
      };
    },
  });
}

export function useDietOfferingTemplate(templateId: string | null) {
  return useQuery({
    queryKey: ['offering-diet-template', templateId],
    enabled: Boolean(templateId),
    queryFn: async (): Promise<DietOfferingTemplate | null> => {
      const { data, error } = await supabase
        .from('diet_plan_templates')
        .select('id,name,title,objective,target_calories,target_protein_g,target_carbs_g,target_fats_g,diet_template_meals(id,meal_type,title,target_time,order_index,diet_template_meal_items(id,food_id,custom_food_name,quantity_g,quantity_unit,quantity_value,kcal,protein_g,carbs_g,fat_g,fiber_g,notes,order_index,food:nutrition_foods(name)))')
        .eq('id', templateId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        title: data.title || data.name,
        objective: data.objective ?? '',
        targetCalories: asNumber(data.target_calories),
        targetProteinG: asNumber(data.target_protein_g),
        targetCarbsG: asNumber(data.target_carbs_g),
        targetFatsG: asNumber(data.target_fats_g),
        meals: [...(data.diet_template_meals ?? [])]
          .sort((a, b) => a.order_index - b.order_index)
          .map((meal) => ({
            id: meal.id,
            mealType: meal.meal_type,
            title: meal.title ?? '',
            targetTime: meal.target_time?.slice(0, 5) ?? '',
            items: [...(meal.diet_template_meal_items ?? [])]
              .sort((a, b) => a.order_index - b.order_index)
              .map((item) => ({
                id: item.id,
                foodId: item.food_id,
                name: item.custom_food_name || (item.food as { name?: string } | null)?.name || '',
                quantityG: asNumber(item.quantity_g) ?? 0,
                quantityUnit: item.quantity_unit ?? 'grama',
                quantityValue: asNumber(item.quantity_value),
                kcal: asNumber(item.kcal),
                proteinG: asNumber(item.protein_g),
                carbsG: asNumber(item.carbs_g),
                fatG: asNumber(item.fat_g),
                fiberG: asNumber(item.fiber_g),
                notes: item.notes ?? '',
              })),
          })),
      };
    },
  });
}

export function useSaveWorkoutOfferingContent(offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      workoutId: string | null;
      trainingType: WorkoutTrainingType;
      title: string;
      description: string;
      exercises: unknown[];
      prescription: WorkoutPrescription;
    }) => {
      const { data, error } = await supabase.rpc('save_standalone_workout_offering_content', {
        p_offering_id: offeringId,
        p_workout_id: input.workoutId,
        p_training_type: input.trainingType,
        p_title: input.title,
        p_description: input.description || null,
        p_exercises: input.exercises,
        p_prescription: input.prescription,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: (workoutId) => {
      void queryClient.invalidateQueries({ queryKey: ['offering-workout-template', workoutId] });
      void queryClient.invalidateQueries({ queryKey: ['business-offering'] });
      void queryClient.invalidateQueries({ queryKey: ['business-offerings'] });
    },
  });
}

export function useSaveDietOfferingContent(offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      templateId: string | null;
      title: string;
      objective: string;
      targetCalories: number | null;
      targetProteinG: number | null;
      targetCarbsG: number | null;
      targetFatsG: number | null;
      meals: unknown[];
    }) => {
      const { data, error } = await supabase.rpc('save_standalone_diet_offering_content', {
        p_offering_id: offeringId,
        p_template_id: input.templateId,
        p_title: input.title,
        p_objective: input.objective || null,
        p_target_calories: input.targetCalories,
        p_target_protein_g: input.targetProteinG,
        p_target_carbs_g: input.targetCarbsG,
        p_target_fats_g: input.targetFatsG,
        p_meals: input.meals,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: (templateId) => {
      void queryClient.invalidateQueries({ queryKey: ['offering-diet-template', templateId] });
      void queryClient.invalidateQueries({ queryKey: ['business-offering'] });
      void queryClient.invalidateQueries({ queryKey: ['business-offerings'] });
    },
  });
}
