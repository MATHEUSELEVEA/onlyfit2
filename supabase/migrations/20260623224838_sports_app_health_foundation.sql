CREATE TABLE IF NOT EXISTS public.health_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('strava','fit_upload','healthkit','healthconnect','garmin')),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','disconnected','expired','action_required','prepared')),
  scopes text[] NOT NULL DEFAULT '{}',
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS public.health_provider_tokens (
  connection_id uuid PRIMARY KEY REFERENCES public.health_connections(id) ON DELETE CASCADE,
  provider_user_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.external_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('strava','fit_upload','healthkit','healthconnect','garmin','manual')),
  provider_activity_id text,
  sport text NOT NULL,
  engine text NOT NULL CHECK (engine IN ('endurance','crossfit','combat','strength','recovery')),
  activity_type text,
  title text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_s integer CHECK (duration_s IS NULL OR duration_s >= 0),
  moving_time_s integer CHECK (moving_time_s IS NULL OR moving_time_s >= 0),
  distance_m numeric CHECK (distance_m IS NULL OR distance_m >= 0),
  elevation_gain_m numeric,
  avg_hr numeric,
  max_hr numeric,
  avg_power_w numeric,
  weighted_power_w numeric,
  avg_speed_mps numeric,
  calories numeric,
  tss numeric CHECK (tss IS NULL OR tss >= 0),
  rpe numeric CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10)),
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  streams_available boolean NOT NULL DEFAULT false,
  matched_program_session_id uuid REFERENCES public.training_program_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, provider_activity_id)
);

CREATE TABLE IF NOT EXISTS public.activity_match_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  external_activity_id uuid NOT NULL REFERENCES public.external_activities(id) ON DELETE CASCADE,
  program_session_id uuid REFERENCES public.training_program_sessions(id) ON DELETE CASCADE,
  score numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','accepted','rejected','auto_matched')),
  reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_activity_id, program_session_id)
);

CREATE TABLE IF NOT EXISTS public.wod_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_result_id uuid REFERENCES public.program_session_results(id) ON DELETE SET NULL,
  program_session_id uuid REFERENCES public.training_program_sessions(id) ON DELETE SET NULL,
  format text NOT NULL CHECK (format IN ('for_time','amrap','emom','rounds','tabata','chipper','hero')),
  rx boolean NOT NULL DEFAULT false,
  score_type text NOT NULL CHECK (score_type IN ('time','rounds_reps','load','reps')),
  score_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.movement_prs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  movement_key text NOT NULL,
  movement_name text NOT NULL,
  value numeric NOT NULL,
  unit text NOT NULL,
  source text NOT NULL CHECK (source IN ('wod','strength','manual','external')),
  source_id uuid,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, movement_key, unit, source_id)
);

CREATE INDEX IF NOT EXISTS health_connections_user_idx ON public.health_connections (user_id, provider);
CREATE INDEX IF NOT EXISTS external_activities_user_started_idx ON public.external_activities (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS external_activities_match_idx ON public.external_activities (matched_program_session_id);
CREATE INDEX IF NOT EXISTS activity_match_candidates_user_idx ON public.activity_match_candidates (user_id, status);
CREATE INDEX IF NOT EXISTS wod_scores_user_completed_idx ON public.wod_scores (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS movement_prs_user_movement_idx ON public.movement_prs (user_id, movement_key, achieved_at DESC);

ALTER TABLE public.health_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_provider_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_match_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wod_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_prs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_connections_select_self" ON public.health_connections;
CREATE POLICY "health_connections_select_self" ON public.health_connections
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "health_connections_insert_self" ON public.health_connections;
CREATE POLICY "health_connections_insert_self" ON public.health_connections
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "health_connections_update_self" ON public.health_connections;
CREATE POLICY "health_connections_update_self" ON public.health_connections
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "health_connections_delete_self" ON public.health_connections;
CREATE POLICY "health_connections_delete_self" ON public.health_connections
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- Tokens ficam bloqueados para o client. Edge functions com service role fazem leitura/escrita.
REVOKE ALL ON public.health_provider_tokens FROM anon, authenticated;

DROP POLICY IF EXISTS "external_activities_select_self" ON public.external_activities;
CREATE POLICY "external_activities_select_self" ON public.external_activities
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "external_activities_insert_self" ON public.external_activities;
CREATE POLICY "external_activities_insert_self" ON public.external_activities
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "external_activities_update_self" ON public.external_activities;
CREATE POLICY "external_activities_update_self" ON public.external_activities
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "external_activities_delete_self" ON public.external_activities;
CREATE POLICY "external_activities_delete_self" ON public.external_activities
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "activity_match_candidates_self" ON public.activity_match_candidates;
CREATE POLICY "activity_match_candidates_self" ON public.activity_match_candidates
  FOR ALL TO authenticated
  USING (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.external_activities ea
      WHERE ea.id = activity_match_candidates.external_activity_id
        AND ea.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.external_activities ea
      WHERE ea.id = activity_match_candidates.external_activity_id
        AND ea.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "wod_scores_self" ON public.wod_scores;
CREATE POLICY "wod_scores_self" ON public.wod_scores
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "movement_prs_self" ON public.movement_prs;
CREATE POLICY "movement_prs_self" ON public.movement_prs
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_match_candidates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wod_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movement_prs TO authenticated;
