-- Migration: Reduce Redundant Requests (90% Reduction Plan)
-- Date: 2026-06-20
-- Phase 0 & 1: Stop bleeding + eliminate internal waste

-- =============================================
-- Phase 0: Block external background workers (522 errors)
-- =============================================

-- Revoke public access to worker-related RPCs that are failing with 522
-- These are called by external Claude Agentics workers, not the frontend
DO $$
BEGIN
  -- Revoke execute on worker heartbeat functions if they exist
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_worker_heartbeat' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE ALL ON FUNCTION public.upsert_worker_heartbeat FROM PUBLIC, anon, authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'claim_next_pipeline_event' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE ALL ON FUNCTION public.claim_next_pipeline_event FROM PUBLIC, anon, authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'pick_next_content_job' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE ALL ON FUNCTION public.pick_next_content_job FROM PUBLIC, anon, authenticated;
  END IF;

  -- Revoke access to dispatcher_heartbeats table if it exists
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'dispatcher_heartbeats' AND schemaname = 'public') THEN
    REVOKE ALL ON public.dispatcher_heartbeats FROM PUBLIC, anon, authenticated;
  END IF;

  -- Revoke access to content_jobs table in any schema
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'content_jobs' AND schemaname = 'claude_agentics') THEN
    REVOKE ALL ON claude_agentics.content_jobs FROM PUBLIC, anon, authenticated;
  END IF;

  -- Revoke access to human_approval_requests if it exists (causing 401 polling)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'human_approval_requests' AND schemaname = 'public') THEN
    REVOKE ALL ON public.human_approval_requests FROM PUBLIC, anon, authenticated;
  END IF;

  -- Revoke access to learning_insights if it exists
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'learning_insights' AND schemaname = 'public') THEN
    REVOKE ALL ON public.learning_insights FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;

-- =============================================
-- Phase 1.1: Block human_approval_requests table access
-- =============================================

-- Also try to drop the human_approval_requests table if it exists (unused)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'human_approval_requests' AND schemaname = 'public') THEN
    -- Ensure no public access
    REVOKE ALL ON public.human_approval_requests FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END;
$$;

-- =============================================
-- Phase 1.2: Drop track_engagement RPC (no-op, ~35k req/day)
-- =============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'track_engagement' AND pronamespace = 'public'::regnamespace) THEN
    DROP FUNCTION IF EXISTS public.track_engagement;
  END IF;
END;
$$;

-- =============================================
-- Phase 1.3: Fix enum content_job_status (claude_agentics schema)
-- =============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_job_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'claude_agentics')) THEN
    ALTER TYPE claude_agentics.content_job_status ADD VALUE IF NOT EXISTS 'FUNNEL_PLANNING_RUNNING';
    ALTER TYPE claude_agentics.content_job_status ADD VALUE IF NOT EXISTS 'IMAGE_PROMPT_REWORK_DONE';
  END IF;
END;
$$;

-- =============================================
-- Phase 1.5: Fix schema mismatches
-- =============================================

-- Fix: column messages.content does not exist → likely 'body'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'messages' AND schemaname = 'public') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'content') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'body') THEN
        CREATE OR REPLACE VIEW public.messages_with_content AS
        SELECT *, body AS content FROM public.messages;
      END IF;
    END IF;
  END IF;
END;
$$;

-- Fix: column creator_profiles.full_name does not exist
-- This is likely meant to be profiles.full_name instead
-- No DDL fix needed — the query should join to profiles for full_name

-- =============================================
-- Phase 3: Reduce cron job frequencies (via pg_cron unschedule/reschedule)
-- These crons are in claude_agentics or public schema
-- =============================================

DO $$
DECLARE
  cron_exists boolean;
BEGIN
  -- Check if pg_cron extension exists
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO cron_exists;
  
  IF cron_exists THEN
    -- Reduce invoke_pulse_whatsapp_dispatcher from 1min to 2min
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoke_pulse_whatsapp_dispatcher') THEN
      PERFORM cron.unschedule('invoke_pulse_whatsapp_dispatcher');
      PERFORM cron.schedule('invoke_pulse_whatsapp_dispatcher', '*/2 * * * *', 'SELECT invoke_pulse_whatsapp_dispatcher_secure()');
    END IF;

    -- Reduce invoke_pulse_nudge_engine from 2min to 5min
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoke_pulse_nudge_engine') THEN
      PERFORM cron.unschedule('invoke_pulse_nudge_engine');
      PERFORM cron.schedule('invoke_pulse_nudge_engine', '*/5 * * * *', 'SELECT invoke_pulse_nudge_engine_secure()');
    END IF;

    -- Reduce invoke_pulse_load_analyzer from 3min to 15min
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoke_pulse_load_analyzer') THEN
      PERFORM cron.unschedule('invoke_pulse_load_analyzer');
      PERFORM cron.schedule('invoke_pulse_load_analyzer', '*/15 * * * *', 'SELECT invoke_pulse_load_analyzer_secure()');
    END IF;

    -- Reduce recover_stale_pulse_processing_textgen from 7min to 15min
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recover_stale_pulse_processing_textgen') THEN
      PERFORM cron.unschedule('recover_stale_pulse_processing_textgen');
      PERFORM cron.schedule('recover_stale_pulse_processing_textgen', '*/15 * * * *', 'SELECT recover_stale_pulse_processing_textgen(15)');
    END IF;

    -- Reduce invoke_pulse_reconcile_checkouts from 15min to 30min
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoke_pulse_reconcile_checkouts') THEN
      PERFORM cron.unschedule('invoke_pulse_reconcile_checkouts');
      PERFORM cron.schedule('invoke_pulse_reconcile_checkouts', '*/30 * * * *', 'SELECT invoke_pulse_reconcile_checkouts_secure()');
    END IF;

    -- Reduce cleanup-rate-limit-buckets from 30min to 60min
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-rate-limit-buckets') THEN
      PERFORM cron.unschedule('cleanup-rate-limit-buckets');
      PERFORM cron.schedule('cleanup-rate-limit-buckets', '0 * * * *', 'SELECT cleanup_rate_limit_buckets()');
    END IF;

    -- Reduce pulse_pix_expiring_soon from 15min to 30min
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pulse_pix_expiring_soon') THEN
      PERFORM cron.unschedule('pulse_pix_expiring_soon');
      PERFORM cron.schedule('pulse_pix_expiring_soon', '*/30 * * * *', 'SELECT pulse_scan_pix_expiring_soon()');
    END IF;

    -- Reduce pulse_checkout_link_reminders from hourly to every 2h
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pulse_checkout_link_reminders') THEN
      PERFORM cron.unschedule('pulse_checkout_link_reminders');
      PERFORM cron.schedule('pulse_checkout_link_reminders', '0 */2 * * *', 'SELECT pulse_schedule_checkout_link_reminders()');
    END IF;
  END IF;
END;
$$;
