-- Migration: Burst Test Performance Indexes for 200 simultaneous users
-- Created: 2026-06-21
-- Context: Support k6 burst test with 200 VUs by eliminating sequential scans
--   on tables hit most during the test.
--
-- See plan: .cursor/plans/auditoria_profunda_de_performance_218aa023.plan.md

begin;

-- ===========================================================================
-- 1. notifications: sequential scan -> index seek
--    Query: user_id=eq.${uid}&order=created_at.desc&limit=50
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- ===========================================================================
-- 2. messages: sequential scan -> index seek
--    Queries: receiver_id=eq.${uid}&order=created_at.desc&limit=20
--    Also covers sender_id+receiver_id for conversation queries
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_messages_receiver_created
  ON public.messages (receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver_created
  ON public.messages (sender_id, receiver_id, created_at DESC);

-- ===========================================================================
-- 3. user_preferences: sequential scan -> index seek
--    Query: user_id=eq.${uid}&select=feed_sport_filter
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_user_preferences_user
  ON public.user_preferences (user_id);

-- ===========================================================================
-- 4. student_workout_assignments: re-create index dropped by hardening
--    migration 20260621144333 (line 246). Used by get_student_workouts_bundle.
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_assignments_student_status
  ON public.student_workout_assignments (student_user_id, status);

-- ===========================================================================
-- 5. diet_adherence_logs: re-create index dropped by hardening
--    migration 20260621144333 (line 237). Used by get_diet_plan_adherence_rollups.
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_diet_adherence_student_logged
  ON public.diet_adherence_logs (diet_plan_id, student_id);

-- ===========================================================================
-- 6. Enable pg_stat_statements for slow query monitoring
-- ===========================================================================
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

commit;
