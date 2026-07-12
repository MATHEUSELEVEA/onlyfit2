-- =============================================================================
-- Cadastro: CPF Único e Estrutura Completa (creator_invited_students)
-- Projeto Pulse - OnlyFit
-- =============================================================================
-- Garante que o cadastro de alunos tenha CPF único e todas as colunas necessárias.

-- 1. Colunas extras em creator_invited_students (se não existirem)
ALTER TABLE public.creator_invited_students
  ADD COLUMN IF NOT EXISTS student_group TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS send_access_info BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.creator_invited_students.cpf IS 'CPF do aluno (11 dígitos, sem formatação). Único no sistema.';
COMMENT ON COLUMN public.creator_invited_students.student_group IS 'Segmento: Presencial, Online, Híbrido, VIP';
COMMENT ON COLUMN public.creator_invited_students.send_access_info IS 'Enviar dados de acesso por email ao convidar';

-- 2. Índice único de CPF (um CPF por cadastro em todo o sistema)
-- Garante cadastro único por CPF; remove e recria para garantir consistência
DROP INDEX IF EXISTS public.idx_unique_cpf_invited_students;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_cpf_invited_students
  ON public.creator_invited_students(cpf)
  WHERE cpf IS NOT NULL;
