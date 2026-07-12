-- Descanso por série: cada set pode ter seu próprio tempo de descanso (segundos).
-- Quando rest_per_set é null, usa rest_seconds para todos os sets.

BEGIN;

ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS rest_per_set integer[] DEFAULT NULL;

COMMENT ON COLUMN public.workout_exercises.rest_per_set IS 'Optional rest in seconds per set; length = sets. When null, use rest_seconds for all.';

-- View já expõe rest_seconds; para compatibilidade leitura podemos expor rest_per_set na view se necessário (opcional).
-- Por ora a view não precisa incluir rest_per_set; o app lê direto de workout_exercises ao carregar treino.

COMMIT;
