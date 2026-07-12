-- Auditoria MVP 1–6: remediação de advisors (segurança + performance), sem mudar comportamento.
-- 1) search_path imutável no trigger; 2) tirar is_place_owner do anon;
-- 3) índices de FK; 4) (select auth.uid()) nas RLS (initplan); 5) split de FOR ALL.

-- 1) trigger com search_path fixo
CREATE OR REPLACE FUNCTION public.places_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 2) helper de RLS não deve ser chamável por anon
REVOKE EXECUTE ON FUNCTION public.is_place_owner(uuid) FROM anon, public;

-- 3) índices cobrindo FKs
CREATE INDEX IF NOT EXISTS places_created_by_idx ON public.places (created_by);
CREATE INDEX IF NOT EXISTS training_programs_owner_id_idx ON public.training_programs (owner_id);
CREATE INDEX IF NOT EXISTS tpsp_session_id_idx ON public.training_program_session_progress (session_id);

-- 4 & 5) RLS: (select auth.uid()) e split de FOR ALL ----------------------------

-- places
DROP POLICY IF EXISTS "places_insert_creator" ON public.places;
CREATE POLICY "places_insert_creator" ON public.places
  FOR INSERT TO authenticated WITH CHECK (created_by = (select auth.uid()));
DROP POLICY IF EXISTS "places_update_owner" ON public.places;
CREATE POLICY "places_update_owner" ON public.places
  FOR UPDATE TO authenticated
  USING (claimed_by = (select auth.uid()) OR created_by = (select auth.uid()))
  WITH CHECK (claimed_by = (select auth.uid()) OR created_by = (select auth.uid()));
DROP POLICY IF EXISTS "places_delete_creator" ON public.places;
CREATE POLICY "places_delete_creator" ON public.places
  FOR DELETE TO authenticated USING (created_by = (select auth.uid()));

-- place_members
DROP POLICY IF EXISTS "place_members_insert_self" ON public.place_members;
CREATE POLICY "place_members_insert_self" ON public.place_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()) OR public.is_place_owner(place_id));
DROP POLICY IF EXISTS "place_members_update_self_or_owner" ON public.place_members;
CREATE POLICY "place_members_update_self_or_owner" ON public.place_members
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()) OR public.is_place_owner(place_id))
  WITH CHECK (user_id = (select auth.uid()) OR public.is_place_owner(place_id));
DROP POLICY IF EXISTS "place_members_delete_self_or_owner" ON public.place_members;
CREATE POLICY "place_members_delete_self_or_owner" ON public.place_members
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()) OR public.is_place_owner(place_id));

-- training_programs
DROP POLICY IF EXISTS "training_programs_select" ON public.training_programs;
CREATE POLICY "training_programs_select" ON public.training_programs
  FOR SELECT TO authenticated USING (is_published = true OR owner_id = (select auth.uid()));
DROP POLICY IF EXISTS "training_programs_insert_owner" ON public.training_programs;
CREATE POLICY "training_programs_insert_owner" ON public.training_programs
  FOR INSERT TO authenticated WITH CHECK (owner_id = (select auth.uid()) AND source = 'coach');
DROP POLICY IF EXISTS "training_programs_update_owner" ON public.training_programs;
CREATE POLICY "training_programs_update_owner" ON public.training_programs
  FOR UPDATE TO authenticated USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()));
DROP POLICY IF EXISTS "training_programs_delete_owner" ON public.training_programs;
CREATE POLICY "training_programs_delete_owner" ON public.training_programs
  FOR DELETE TO authenticated USING (owner_id = (select auth.uid()));

-- training_program_sessions (split do FOR ALL -> remove SELECT duplicado)
DROP POLICY IF EXISTS "tps_select" ON public.training_program_sessions;
CREATE POLICY "tps_select" ON public.training_program_sessions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.training_programs p
            WHERE p.id = program_id AND (p.is_published = true OR p.owner_id = (select auth.uid())))
  );
DROP POLICY IF EXISTS "tps_write_owner" ON public.training_program_sessions;
CREATE POLICY "tps_insert_owner" ON public.training_program_sessions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_id AND p.owner_id = (select auth.uid())));
CREATE POLICY "tps_update_owner" ON public.training_program_sessions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_id AND p.owner_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_id AND p.owner_id = (select auth.uid())));
CREATE POLICY "tps_delete_owner" ON public.training_program_sessions
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_id AND p.owner_id = (select auth.uid())));

-- training_program_enrollments
DROP POLICY IF EXISTS "tpe_select_self" ON public.training_program_enrollments;
CREATE POLICY "tpe_select_self" ON public.training_program_enrollments
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "tpe_insert_self" ON public.training_program_enrollments;
CREATE POLICY "tpe_insert_self" ON public.training_program_enrollments
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "tpe_update_self" ON public.training_program_enrollments;
CREATE POLICY "tpe_update_self" ON public.training_program_enrollments
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "tpe_delete_self" ON public.training_program_enrollments;
CREATE POLICY "tpe_delete_self" ON public.training_program_enrollments
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- training_program_session_progress
DROP POLICY IF EXISTS "tpsp_all_self" ON public.training_program_session_progress;
CREATE POLICY "tpsp_all_self" ON public.training_program_session_progress
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_program_enrollments e
                 WHERE e.id = enrollment_id AND e.user_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_program_enrollments e
                      WHERE e.id = enrollment_id AND e.user_id = (select auth.uid())));

-- training_program_weeks (split do FOR ALL)
DROP POLICY IF EXISTS "tpw_select" ON public.training_program_weeks;
CREATE POLICY "tpw_select" ON public.training_program_weeks
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.training_programs p
            WHERE p.id = program_id AND (p.is_published = true OR p.owner_id = (select auth.uid()))));
DROP POLICY IF EXISTS "tpw_write_owner" ON public.training_program_weeks;
CREATE POLICY "tpw_insert_owner" ON public.training_program_weeks
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_id AND p.owner_id = (select auth.uid())));
CREATE POLICY "tpw_update_owner" ON public.training_program_weeks
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_id AND p.owner_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_id AND p.owner_id = (select auth.uid())));
CREATE POLICY "tpw_delete_owner" ON public.training_program_weeks
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_id AND p.owner_id = (select auth.uid())));
