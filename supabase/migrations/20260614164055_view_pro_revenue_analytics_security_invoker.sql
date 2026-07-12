-- hm-security D14 (RLS hardening) — fix cross-tenant revenue leak.
--
-- view_pro_revenue_analytics estava SEM security_invoker, então rodava com os
-- privilégios do owner e IGNORAVA a RLS de creator_profiles/coach_relationships.
-- A view não filtra por auth.uid() (faz count(cr.id) por coach), então qualquer
-- usuário autenticado conseguia ler o MRR/nº de alunos de TODOS os coaches via
-- PostgREST (GET /view_pro_revenue_analytics sem filtro) — vazamento multi-tenant.
--
-- Com security_invoker=on a view passa a respeitar a RLS do usuário que consulta:
--   - creator_profiles: SELECT público (subscription_price já é público por design)
--   - coach_relationships: SELECT só onde coach_id/student_id = auth.uid()
-- Logo cada coach vê o próprio MRR real; linhas de outros coaches colapsam para
-- 0 alunos / 0 MRR (relações não visíveis). O consumo no app (useProAnalytics,
-- .eq('pro_id', userId).single()) continua funcionando igual.
--
-- Alinha esta view ao mesmo hardening já aplicado em view_coach_students_crm e
-- view_workout_exercises_enriched. Idempotente.

ALTER VIEW public.view_pro_revenue_analytics SET (security_invoker = on);
