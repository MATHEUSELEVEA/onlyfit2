-- Escopo de visibilidade de treinos para o aluno: o personal escolhe o que o aluno pode ver.
-- Valores: all | current_program_only | today_only | current_plus_next | current_plus_previous
--         | current_plus_1_previous | current_plus_1_next | current_plus_1_prev_1_next

ALTER TABLE public.coach_relationships
  ADD COLUMN IF NOT EXISTS student_workout_visibility TEXT
  DEFAULT 'today_only'
  CHECK (student_workout_visibility IS NULL OR student_workout_visibility IN (
    'all',
    'current_program_only',
    'today_only',
    'current_plus_next',
    'current_plus_previous',
    'current_plus_1_previous',
    'current_plus_1_next',
    'current_plus_1_prev_1_next'
  ));

COMMENT ON COLUMN public.coach_relationships.student_workout_visibility IS 'O que o aluno pode visualizar em treinos: all, current_program_only, today_only, current_plus_* (próximos/anteriores/semana).';

-- RLS view_workout_exercises_enriched: a view herda visibilidade das tabelas base (workouts, workout_exercises).
-- Alunos veem workouts via policy "Workouts visibility" (entitlement ou student_workout_assignments).
-- workout_exercises tem "Exercises visibility" (EXISTS em workouts). Se algum treino falhar ao abrir,
-- conferir no Pulse: 1) RLS em workouts para auth.uid() com assignment ativo; 2) view sem policy extra bloqueando.
