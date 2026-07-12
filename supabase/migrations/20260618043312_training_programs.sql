-- MVP 4 — Programas simples (estilo Nike Run Club). Templates do sistema por nicho:
-- capa/objetivo/duração/semanas; usuário "Começa" (enrollment) e marca sessões.
-- Sem IA e sem builder de coach nesta etapa. DB compartilhado: nomes escopados + RLS.

CREATE TABLE IF NOT EXISTS public.training_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport text NOT NULL,
  name text NOT NULL,
  goal text,
  level text NOT NULL DEFAULT 'beginner'
    CHECK (level IN ('beginner','intermediate','advanced')),
  duration_weeks integer NOT NULL DEFAULT 4 CHECK (duration_weeks > 0 AND duration_weeks <= 52),
  cover_url text,
  description text,
  source text NOT NULL DEFAULT 'system' CHECK (source IN ('system','coach')),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_programs_sport_idx ON public.training_programs (sport);

CREATE TABLE IF NOT EXISTS public.training_program_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  week integer NOT NULL CHECK (week > 0),
  day integer NOT NULL CHECK (day BETWEEN 1 AND 7),
  title text NOT NULL,
  description text,
  target jsonb NOT NULL DEFAULT '{}',
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS training_program_sessions_program_idx
  ON public.training_program_sessions (program_id, week, day);

CREATE TABLE IF NOT EXISTS public.training_program_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  current_week integer NOT NULL DEFAULT 1,
  completed_at timestamptz,
  UNIQUE (program_id, user_id)
);
CREATE INDEX IF NOT EXISTS training_program_enrollments_user_idx
  ON public.training_program_enrollments (user_id);

CREATE TABLE IF NOT EXISTS public.training_program_session_progress (
  enrollment_id uuid NOT NULL REFERENCES public.training_program_enrollments(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.training_program_sessions(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (enrollment_id, session_id)
);

-- ===== RLS =====
ALTER TABLE public.training_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_program_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_program_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_program_session_progress ENABLE ROW LEVEL SECURITY;

-- programs: leitura de publicados (ou do dono); escrita só pelo dono (coach).
DROP POLICY IF EXISTS "training_programs_select" ON public.training_programs;
CREATE POLICY "training_programs_select" ON public.training_programs
  FOR SELECT TO authenticated USING (is_published = true OR owner_id = auth.uid());

DROP POLICY IF EXISTS "training_programs_insert_owner" ON public.training_programs;
CREATE POLICY "training_programs_insert_owner" ON public.training_programs
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND source = 'coach');

DROP POLICY IF EXISTS "training_programs_update_owner" ON public.training_programs;
CREATE POLICY "training_programs_update_owner" ON public.training_programs
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "training_programs_delete_owner" ON public.training_programs;
CREATE POLICY "training_programs_delete_owner" ON public.training_programs
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- sessions: leitura quando o programa é legível; escrita pelo dono do programa.
DROP POLICY IF EXISTS "tps_select" ON public.training_program_sessions;
CREATE POLICY "tps_select" ON public.training_program_sessions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.training_programs p
            WHERE p.id = program_id AND (p.is_published = true OR p.owner_id = auth.uid()))
  );

DROP POLICY IF EXISTS "tps_write_owner" ON public.training_program_sessions;
CREATE POLICY "tps_write_owner" ON public.training_program_sessions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_id AND p.owner_id = auth.uid()));

-- enrollments: cada usuário gerencia as próprias matrículas.
DROP POLICY IF EXISTS "tpe_select_self" ON public.training_program_enrollments;
CREATE POLICY "tpe_select_self" ON public.training_program_enrollments
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "tpe_insert_self" ON public.training_program_enrollments;
CREATE POLICY "tpe_insert_self" ON public.training_program_enrollments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "tpe_update_self" ON public.training_program_enrollments;
CREATE POLICY "tpe_update_self" ON public.training_program_enrollments
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "tpe_delete_self" ON public.training_program_enrollments;
CREATE POLICY "tpe_delete_self" ON public.training_program_enrollments
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- progress: dono da matrícula gerencia o próprio progresso.
DROP POLICY IF EXISTS "tpsp_all_self" ON public.training_program_session_progress;
CREATE POLICY "tpsp_all_self" ON public.training_program_session_progress
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_program_enrollments e
                 WHERE e.id = enrollment_id AND e.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_program_enrollments e
                      WHERE e.id = enrollment_id AND e.user_id = auth.uid()));
