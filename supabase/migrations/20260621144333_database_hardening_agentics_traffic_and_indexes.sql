-- Database hardening for PULSE production traffic and agentics objects.
--
-- Context:
-- - 2026-06-21 incident showed an obsolete Node worker polling
--   human_approval_requests continuously with invalid credentials.
-- - Supabase advisors also reported mutable search_path on agentics functions
--   and several duplicate non-constraint indexes.
--
-- Scope:
-- - Keep app-facing public/clinical behavior intact.
-- - Do not move extensions out of public here, because this project has an
--   explicit compatibility migration restoring public extension access.
-- - Do not drop unique/primary-key duplicate indexes in this migration.

begin;

-- ---------------------------------------------------------------------------
-- 1. Stop legacy client/API access to agentics worker internals.
-- ---------------------------------------------------------------------------

do $$
declare
  t regclass;
begin
  foreach t in array array[
    to_regclass('claude_agentics.human_approval_requests'),
    to_regclass('claude_agentics.dispatcher_heartbeats'),
    to_regclass('claude_agentics.worker_heartbeats'),
    to_regclass('claude_agentics.learning_insights'),
    to_regclass('claude_agentics.dead_letter_queue'),
    to_regclass('claude_agentics.pipeline_job_locks'),
    to_regclass('claude_agentics.pipeline_worker_metrics')
  ]
  loop
    if t is not null then
      execute format('alter table %s enable row level security', t);
      execute format('alter table %s force row level security', t);
      execute format('revoke all on table %s from public, anon, authenticated', t);
      execute format('grant select, insert, update, delete on table %s to service_role', t);
    end if;
  end loop;
end;
$$;

do $$
begin
  if to_regclass('claude_agentics.human_approval_requests') is not null then
    drop policy if exists "Approval delete tenant members" on claude_agentics.human_approval_requests;
    drop policy if exists "Approval select tenant members" on claude_agentics.human_approval_requests;
    drop policy if exists "Approval update tenant members" on claude_agentics.human_approval_requests;
    drop policy if exists "Human approval select accessible" on claude_agentics.human_approval_requests;

    drop policy if exists "deny_all_client_access" on claude_agentics.human_approval_requests;
    create policy "deny_all_client_access"
      on claude_agentics.human_approval_requests
      as restrictive
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end;
$$;

do $$
declare
  fn record;
begin
  for fn in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as identity_args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'claude_agentics'
       and p.proname in (
         'check_rate_limit',
         'claim_next_pipeline_event',
         'pick_next_content_job',
         'upsert_worker_heartbeat',
         'enqueue_pipeline_event_from_job_status'
       )
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Fix mutable search_path on project-owned agentics functions.
-- ---------------------------------------------------------------------------

do $$
declare
  fn record;
begin
  for fn in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as identity_args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'claude_agentics'
       and (
         p.proconfig is null
         or not exists (
           select 1
             from unnest(p.proconfig) as c
            where c like 'search_path=%'
         )
       )
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = %I, public, auth, extensions, pg_temp',
      fn.schema_name,
      fn.function_name,
      fn.identity_args,
      fn.schema_name
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reduce background cron pressure. These schedules preserve behavior but
--    avoid unnecessary polling while the app is pre-launch / low traffic.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'invoke_pulse_whatsapp_dispatcher') then
      perform cron.unschedule('invoke_pulse_whatsapp_dispatcher');
      perform cron.schedule(
        'invoke_pulse_whatsapp_dispatcher',
        '*/5 * * * *',
        'SELECT invoke_pulse_whatsapp_dispatcher_secure()'
      );
    end if;

    if exists (select 1 from cron.job where jobname = 'recover_stale_pulse_sending') then
      perform cron.unschedule('recover_stale_pulse_sending');
      perform cron.schedule(
        'recover_stale_pulse_sending',
        '*/15 * * * *',
        'SELECT public.recover_stale_pulse_sending(10);'
      );
    end if;

    if exists (select 1 from cron.job where jobname = 'invoke_pulse_nudge_engine') then
      perform cron.unschedule('invoke_pulse_nudge_engine');
      perform cron.schedule(
        'invoke_pulse_nudge_engine',
        '*/15 * * * *',
        'SELECT invoke_pulse_nudge_engine_secure()'
      );
    end if;

    if exists (select 1 from cron.job where jobname = 'invoke_pulse_dunning_engine') then
      perform cron.unschedule('invoke_pulse_dunning_engine');
      perform cron.schedule(
        'invoke_pulse_dunning_engine',
        '*/15 * * * *',
        'SELECT public.invoke_pulse_dunning_engine_secure();'
      );
    end if;

    if exists (select 1 from cron.job where jobname = 'invoke_pulse_whatsapp_instances_status_sync') then
      perform cron.unschedule('invoke_pulse_whatsapp_instances_status_sync');
      perform cron.schedule(
        'invoke_pulse_whatsapp_instances_status_sync',
        '*/30 * * * *',
        'SELECT public.invoke_pulse_whatsapp_instances_status_sync_secure();'
      );
    end if;

    if exists (select 1 from cron.job where jobname = 'pipeline-watchdog') then
      perform cron.unschedule('pipeline-watchdog');
      perform cron.schedule(
        'pipeline-watchdog',
        '0 * * * *',
        'select claude_agentics.pipeline_watchdog_cleanup()'
      );
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Keep queue indexes compact and aligned with polling queries.
-- ---------------------------------------------------------------------------

create index if not exists idx_human_approval_waiting_created_at
  on claude_agentics.human_approval_requests (created_at desc)
  where status = 'WAITING';

create index if not exists idx_pipeline_events_ready_queue
  on claude_agentics.pipeline_events (priority desc, run_after asc, created_at asc)
  where status in ('PENDING', 'RETRY');

create index if not exists idx_content_jobs_active_status_priority
  on claude_agentics.content_jobs (status, priority desc, updated_at asc)
  where deleted_at is null;

create index if not exists idx_worker_heartbeats_last_seen
  on claude_agentics.worker_heartbeats (last_heartbeat_at desc);

-- ---------------------------------------------------------------------------
-- 5. Drop duplicate non-constraint indexes reported by advisors.
--    Unique and primary-key duplicates are intentionally left untouched.
-- ---------------------------------------------------------------------------

drop index if exists claude_agentics.idx_agent_runs_job;
drop index if exists claude_agentics.idx_brand_social_accounts_tenant_brand;
drop index if exists claude_agentics.idx_dead_letter_created;
drop index if exists claude_agentics.idx_human_approval_job;
drop index if exists claude_agentics.idx_human_approval_status;
drop index if exists claude_agentics.idx_pipeline_events_content_job;
drop index if exists claude_agentics.pipeline_events_archive_content_job_id_idx1;
drop index if exists claude_agentics.idx_tenant_members_tenant;
drop index if exists claude_agentics.idx_tenant_members_user;

drop index if exists public.idx_anamnesis_tenant_student;
drop index if exists public.idx_clinical_exam_reports_student;
drop index if exists public.idx_coach_exercises_creator;
drop index if exists public.idx_diet_adherence_student_logged;
drop index if exists public.idx_exercise_library_category;
drop index if exists public.idx_exercise_library_equipment;
drop index if exists public.idx_exercise_library_name_en_trgm;
drop index if exists public.idx_exercise_library_name_ptbr_trgm;
drop index if exists public.idx_exercise_library_primary_muscles;
drop index if exists public.idx_exercise_library_search_en;
drop index if exists public.idx_exercise_library_search_pt;
drop index if exists public.idx_progress_photos_tenant_student_date;
drop index if exists public.idx_assignments_student_status;
drop index if exists public.idx_workout_sessions_student_assignment;

commit;
