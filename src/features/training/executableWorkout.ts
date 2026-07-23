import type { WorkoutTemplate } from './TrainingProvider';
import { estimateDurationSeconds, flattenSteps, toGuidedWorkout } from './guidedSession';
import type { StudentWorkout } from './useStudentWorkouts';

function strengthTemplate(workout: StudentWorkout): WorkoutTemplate {
  const exercises = workout.exercises.map((exercise, index) => {
    const name = exercise.studentDisplayName || exercise.exerciseName || `Exercício ${index + 1}`;
    return {
      id: exercise.id,
      name,
      muscle: exercise.muscleGroup || 'Exercício',
      sets: exercise.sets,
      targetReps: exercise.reps,
      lastWeight: 0,
      lastReps: Number(exercise.reps.match(/\d+/)?.[0] ?? 10),
      technique: exercise.notes || exercise.tempoNotes || 'Siga as orientações do seu profissional.',
      demoLabel: name,
      videoUrl: exercise.videoUrl,
      instructions: exercise.instructions,
    };
  });
  const muscleGroups = [...new Set(exercises.map((exercise) => exercise.muscle).filter((muscle) => muscle !== 'Exercício'))];
  const setCount = exercises.reduce((total, exercise) => total + exercise.sets, 0);
  return {
    id: `library-${workout.workoutId ?? workout.assignmentId}`,
    title: workout.title,
    focus: muscleGroups.slice(0, 3).join(' · ') || workout.prescription?.session.objective || 'Treino prescrito',
    durationMin: Math.max(0, Math.round(setCount * 2.5)),
    exercises,
  };
}

function roleLabel(role: ReturnType<typeof flattenSteps>[number]['step']['role']): string {
  const labels = {
    warmup: 'Aquecimento',
    activation: 'Ativação',
    main: 'Principal',
    recovery: 'Recuperação',
    cooldown: 'Desaquecimento',
  };
  return labels[role];
}

function boundLabel(bound: ReturnType<typeof flattenSteps>[number]['step']['bound']): string {
  if (bound.by === 'time') return `${Math.max(1, Math.round(bound.seconds / 60))} min`;
  if (bound.by === 'distance') return bound.meters >= 1000 ? `${(bound.meters / 1000).toLocaleString('pt-BR')} km` : `${bound.meters} m`;
  if (bound.by === 'reps') return `${bound.reps} reps`;
  return 'livre';
}

export function workoutTemplate(workout: StudentWorkout): WorkoutTemplate {
  const template = strengthTemplate(workout);
  if (template.exercises.length > 0) return template;

  const guided = toGuidedWorkout(workout);
  const steps = guided ? flattenSteps(guided.steps) : [];
  return {
    ...template,
    durationMin: guided ? Math.round(estimateDurationSeconds(guided.steps) / 60) : template.durationMin,
    exercises: steps.map(({ step, repeatLabel }, index) => {
      const name = [repeatLabel, step.label || step.note || `Passo ${index + 1}`].filter(Boolean).join(' · ');
      return {
        id: `${step.id}-${repeatLabel ?? index}`,
        name,
        muscle: roleLabel(step.role),
        sets: 1,
        targetReps: boundLabel(step.bound),
        lastWeight: 0,
        lastReps: 1,
        technique: step.note || 'Siga as orientações do seu profissional.',
        demoLabel: name,
        videoUrl: null,
        instructions: null,
      };
    }),
  };
}

export function workoutExerciseCount(workout: StudentWorkout): number {
  return workoutTemplate(workout).exercises.length;
}

export function workoutDurationMin(workout: StudentWorkout): number {
  return workoutTemplate(workout).durationMin;
}
