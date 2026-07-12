-- Calorias informadas pelo aluno ao concluir o treino (opcional); exibidas no card compartilhável.
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS calories_logged INTEGER NULL;

COMMENT ON COLUMN public.workout_sessions.calories_logged IS 'Calorias queimadas/estimadas informadas pelo aluno ao finalizar o treino (opcional).';
