-- Vibe Security hardening pass.
-- Scope: close public data/RPC surfaces without changing product behavior.

-- 1) Tables with RLS enabled but no policy should fail closed explicitly.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_turns',
    'creator_billing_cycles',
    'creator_checkout_attempts',
    'email_verification_codes',
    'platform_control_daily_metrics',
    'platform_official_student_template',
    'platform_staff',
    'platform_student_import_batches',
    'pulse_uazapi_webhook_events',
    'support_tickets',
    'user_activation_facts'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS deny_all_client_access ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY deny_all_client_access ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      table_name
    );
  END LOOP;
END $$;

-- 2) Public views should respect the querying user's RLS context.
ALTER VIEW public.activity_log SET (security_invoker = true);
ALTER VIEW public.ai_templates SET (security_invoker = true);
ALTER VIEW public.budget_items SET (security_invoker = true);
ALTER VIEW public.checklist SET (security_invoker = true);
ALTER VIEW public.events SET (security_invoker = true);
ALTER VIEW public.gift_funds SET (security_invoker = true);
ALTER VIEW public.guest_responses SET (security_invoker = true);
ALTER VIEW public.guests SET (security_invoker = true);
ALTER VIEW public.photos SET (security_invoker = true);
ALTER VIEW public.profile_display SET (security_invoker = true);
ALTER VIEW public.seating_tables SET (security_invoker = true);
ALTER VIEW public.timeline SET (security_invoker = true);
ALTER VIEW public.transactions SET (security_invoker = true);
ALTER VIEW public.v_control_membership_funnel_base SET (security_invoker = true);
ALTER VIEW public.v_nutrition_food_usage_stats SET (security_invoker = true);
ALTER VIEW public.v_orphaned_public_form_photos SET (security_invoker = true);
ALTER VIEW public.v_usda_cache_stats SET (security_invoker = true);
ALTER VIEW public.v_usda_cache_top_candidates SET (security_invoker = true);
ALTER VIEW public.v_usda_search_metrics SET (security_invoker = true);
ALTER VIEW public.vendor_leads SET (security_invoker = true);
ALTER VIEW public.vendors SET (security_invoker = true);
ALTER VIEW public.view_workout_exercises_missing SET (security_invoker = true);
ALTER VIEW public.view_workout_exercises_unresolved SET (security_invoker = true);
ALTER VIEW public.wedding_instances SET (security_invoker = true);
ALTER VIEW public.wedding_templates SET (security_invoker = true);

-- 3) Internal/admin/payment RPCs are callable only by service role.
-- Edge Functions and webhooks use service-role clients for these paths.
REVOKE ALL ON FUNCTION public.admin_confirm_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_user(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.asaas_challenge_fulfill_idempotent(text, uuid, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_challenge_fulfill_idempotent(text, uuid, uuid, uuid, numeric) TO service_role;

REVOKE ALL ON FUNCTION public.asaas_consultoria_fulfill_idempotent(text, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_consultoria_fulfill_idempotent(text, uuid, uuid, numeric) TO service_role;

REVOKE ALL ON FUNCTION public.asaas_market_fulfill_orphan_charge(text, uuid, timestamp with time zone, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_market_fulfill_orphan_charge(text, uuid, timestamp with time zone, text) TO service_role;

REVOKE ALL ON FUNCTION public.asaas_market_fulfill_payment(text, uuid, uuid, uuid, numeric, text, timestamp with time zone, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_market_fulfill_payment(text, uuid, uuid, uuid, numeric, text, timestamp with time zone, text) TO service_role;

REVOKE ALL ON FUNCTION public.claim_pulse_dunning_pending_outbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pulse_dunning_pending_outbox(integer) TO service_role;

REVOKE ALL ON FUNCTION public.claim_pulse_nudge_pending_outbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pulse_nudge_pending_outbox(integer) TO service_role;

REVOKE ALL ON FUNCTION public.fetch_and_lock_next_pulse_actions(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_and_lock_next_pulse_actions(integer) TO service_role;

REVOKE ALL ON FUNCTION public.repair_market_orphan_asaas_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_market_orphan_asaas_batch(integer) TO service_role;

REVOKE ALL ON FUNCTION public.repair_market_pending_grant_alert(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_market_pending_grant_alert(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.repair_market_pending_grants(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_market_pending_grants(integer) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_handle_checkout_expired(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_handle_checkout_expired(text) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_handle_invoice_payment_failed(text, uuid, uuid, text, numeric, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_handle_invoice_payment_failed(text, uuid, uuid, text, numeric, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_handle_invoice_payment_succeeded(text, uuid, uuid, text, numeric, bigint, timestamp with time zone, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_handle_invoice_payment_succeeded(text, uuid, uuid, text, numeric, bigint, timestamp with time zone, text, numeric) TO service_role;

REVOKE ALL ON FUNCTION public.try_record_uazapi_webhook_dedup(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_record_uazapi_webhook_dedup(text, text, text, text, text) TO service_role;
