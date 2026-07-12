-- Conjuntos salvos deve mostrar apenas templates criados na aba Templates.
-- Treinos criados no ProgramBuilder para teste não entram na biblioteca.
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS is_library_template BOOLEAN DEFAULT false;
COMMENT ON COLUMN public.workouts.is_library_template IS 'Se true, foi criado como template de biblioteca (aba Templates ou ExpressBuilder) e aparece em Conjuntos salvos.';
