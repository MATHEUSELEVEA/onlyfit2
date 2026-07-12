-- hm-security D13 (multi-tenant isolation) + D2/A01 — remover policies "catch-all"
-- que furam o isolamento por tenant em tabelas sensíveis/financeiras.
--
-- PROBLEMA: várias tabelas tinham uma policy SELECT com qual
--   (auth.role() = 'authenticated')
-- para o role public. Como policies RLS são OR, esse catch-all ANULAVA as
-- policies por-dono ao lado (auth.uid() = coach_id / student_id / user_id):
-- QUALQUER usuário autenticado lia as linhas de TODOS os tenants via PostgREST.
--
-- IMPACTO (financeiro, CRÍTICO): coach A conseguia ler checkouts (com payment_url),
-- charges, assinaturas, fee ledger e mapeamentos stripe de TODOS os coaches.
--
-- FIX: dropar só o catch-all. As policies por-dono já existentes cobrem 100% do
-- uso real do app (todas as queries filtram por coach_id/user_id/student_id do
-- próprio usuário — verificado em useCreatorUnifiedSales, useConsultoriaStatus,
-- PulseFinance, PulseCRM, useNotifications, useProCoach). service_role continua
-- com bypass/policies próprias. Idempotente (DROP ... IF EXISTS).
--
-- NÃO inclui tabelas de referência world-readable por design (exercise_library,
-- master_exercises, nutrition_*, video_runtime_profiles) — lá o acesso amplo é
-- intencional.

-- Financeiro (foco da auditoria)
DROP POLICY IF EXISTS "Authenticated read access" ON public.pulse_checkouts;
DROP POLICY IF EXISTS "Authenticated read access" ON public.pulse_charges;
DROP POLICY IF EXISTS "Authenticated read access" ON public.pulse_subscriptions;
DROP POLICY IF EXISTS "Authenticated read access" ON public.platform_fee_ledger;
DROP POLICY IF EXISTS "Authenticated read access" ON public.stripe_customers;

-- Operacional / pessoal sensível (têm policy por-dono cobrindo o uso real)
DROP POLICY IF EXISTS "Authenticated read access" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated read access" ON public.security_events;
DROP POLICY IF EXISTS "Authenticated read access" ON public.coach_dunning_config;
DROP POLICY IF EXISTS "Authenticated read access" ON public.monthly_performance_reports;
DROP POLICY IF EXISTS "Authenticated read access" ON public.pulse_action_outbox;
DROP POLICY IF EXISTS "Authenticated read access" ON public.referrals;
DROP POLICY IF EXISTS "Authenticated read access" ON public.tenant_quotas;
DROP POLICY IF EXISTS "Authenticated read access" ON public.user_quotas;
