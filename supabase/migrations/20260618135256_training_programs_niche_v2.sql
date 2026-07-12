-- MVP 6 — Programas por nicho (níveis/metas/periodização) + i18n total.
-- Templates do sistema guardam CHAVES i18n (resolvidas no app), nunca texto cru.
-- Conteúdo de coach permanece texto livre (name/goal). Retrocompatível.

ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS name_i18n_key text,
  ADD COLUMN IF NOT EXISTS goal_i18n_key text,
  ADD COLUMN IF NOT EXISTS subtitle_i18n_key text,
  ADD COLUMN IF NOT EXISTS weekly_sessions integer,
  ADD COLUMN IF NOT EXISTS est_minutes_per_week integer,
  ADD COLUMN IF NOT EXISTS equipment text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';

-- slug único entre templates do sistema (idempotência do seed).
CREATE UNIQUE INDEX IF NOT EXISTS training_programs_system_slug_uidx
  ON public.training_programs (sport, slug) WHERE source = 'system';

-- sessões: tipo estruturado + minutos; título deixa de ser obrigatório
-- (sistema deriva o rótulo de session_type via i18n; coach pode usar texto livre).
ALTER TABLE public.training_program_sessions
  ADD COLUMN IF NOT EXISTS session_type text,
  ADD COLUMN IF NOT EXISTS est_minutes integer;
ALTER TABLE public.training_program_sessions
  ALTER COLUMN title DROP NOT NULL;

-- semanas com fase + foco (habilita resumo Apple/Nike e cor de fase).
CREATE TABLE IF NOT EXISTS public.training_program_weeks (
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  week integer NOT NULL CHECK (week > 0),
  phase text NOT NULL DEFAULT 'base'
    CHECK (phase IN ('base','build','peak','taper','deload','skill')),
  focus_i18n_key text,
  target_minutes integer,
  PRIMARY KEY (program_id, week)
);

ALTER TABLE public.training_program_weeks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tpw_select" ON public.training_program_weeks;
CREATE POLICY "tpw_select" ON public.training_program_weeks
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.training_programs p
            WHERE p.id = program_id AND (p.is_published = true OR p.owner_id = auth.uid()))
  );

DROP POLICY IF EXISTS "tpw_write_owner" ON public.training_program_weeks;
CREATE POLICY "tpw_write_owner" ON public.training_program_weeks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_id AND p.owner_id = auth.uid()));
