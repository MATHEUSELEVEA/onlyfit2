-- Auditoria 4 camadas: garantir view security_invoker e valores válidos de student_workout_visibility (Pulse).
-- Ver também: docs/PULSE_AUDIT_TREINOS_ALUNO.md

-- 1. View view_workout_exercises_enriched: garantir security_invoker = on para RLS das tabelas base
ALTER VIEW public.view_workout_exercises_enriched SET (security_invoker = on);

-- 2. Normalizar valores inválidos em coach_relationships.student_workout_visibility
-- (ADD COLUMN IF NOT EXISTS não aplica CHECK em coluna já existente; pode haver dados antigos fora da lista)
UPDATE public.coach_relationships
SET student_workout_visibility = 'today_only'
WHERE student_workout_visibility IS NOT NULL
  AND student_workout_visibility NOT IN (
    'all',
    'current_program_only',
    'today_only',
    'current_plus_next',
    'current_plus_previous',
    'current_plus_1_previous',
    'current_plus_1_next',
    'current_plus_1_prev_1_next'
  );
