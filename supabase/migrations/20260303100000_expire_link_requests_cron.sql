-- Cron: expirar solicitações de vínculo pendentes (expires_at < now())
-- Roda diariamente às 04:00 UTC

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('expire_old_coach_student_link_requests');
    PERFORM cron.schedule(
      'expire_old_coach_student_link_requests',
      '0 4 * * *',
      'SELECT public.expire_old_link_requests();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available, skipping expire_old_link_requests scheduling';
END;
$$;
