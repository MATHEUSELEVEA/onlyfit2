-- CrossFit Community Features: PR tracking + Daily WOD + Leaderboard

-- ============================================================================
-- 1. benchmark_results — PR tracking per user per benchmark_key
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.benchmark_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  benchmark_key text NOT NULL,
  result_time_s integer CHECK (result_time_s IS NULL OR result_time_s > 0),
  result_reps integer CHECK (result_reps IS NULL OR result_reps > 0),
  result_load text CHECK (result_load IS NULL OR length(result_load) <= 40),
  result_rounds integer CHECK (result_rounds IS NULL OR result_rounds > 0),
  result_raw jsonb,
  is_pr boolean NOT NULL DEFAULT false,
  source_session_id uuid,
  source_enrollment_id uuid,
  notes text CHECK (notes IS NULL OR length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benchmark_results ENABLE ROW LEVEL SECURITY;

-- Each user can see their own results + community leaderboard can see non-private ones
CREATE POLICY "br_select_self_or_leaderboard" ON public.benchmark_results
  FOR SELECT TO authenticated USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.user_id = (select auth.uid())
    )
  );

CREATE POLICY "br_insert_self" ON public.benchmark_results
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "br_update_self" ON public.benchmark_results
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "br_delete_self" ON public.benchmark_results
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

CREATE INDEX IF NOT EXISTS idx_benchmark_results_user_key ON public.benchmark_results (user_id, benchmark_key);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_key_time ON public.benchmark_results (benchmark_key, result_time_s NULLS LAST);

-- Auto-set PR flag on insert
CREATE OR REPLACE FUNCTION public.set_benchmark_pr_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_best_time_s int;
  v_best_reps int;
BEGIN
  -- Find current best for this user+benchmark (excluding the new row)
  SELECT
    min(result_time_s),
    max(result_reps)
  INTO v_best_time_s, v_best_reps
  FROM public.benchmark_results
  WHERE user_id = NEW.user_id
    AND benchmark_key = NEW.benchmark_key
    AND id <> NEW.id;

  -- Mark as PR if no previous result, or if this is better
  IF v_best_time_s IS NULL THEN
    NEW.is_pr := true;
  ELSIF NEW.result_time_s IS NOT NULL AND (NEW.result_time_s < v_best_time_s) THEN
    NEW.is_pr := true;
  ELSIF NEW.result_reps IS NOT NULL AND (v_best_reps IS NULL OR NEW.result_reps > v_best_reps) THEN
    NEW.is_pr := true;
  ELSE
    NEW.is_pr := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_benchmark_results_set_pr ON public.benchmark_results;
CREATE TRIGGER trg_benchmark_results_set_pr
  BEFORE INSERT ON public.benchmark_results
  FOR EACH ROW
  EXECUTE FUNCTION public.set_benchmark_pr_flag();

-- ============================================================================
-- 2. daily_wods — WOD do dia for communities/boxes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.daily_wods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  title text NOT NULL CHECK (length(title) >= 3 AND length(title) <= 120),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  movements jsonb NOT NULL DEFAULT '[]'::jsonb,
  format text NOT NULL DEFAULT 'amrap'
    CHECK (format IN ('for_time', 'amrap', 'emom', 'rounds', 'tabata', 'chipper', 'hero')),
  cap_s int CHECK (cap_s IS NULL OR cap_s > 0),
  rounds int CHECK (rounds IS NULL OR rounds > 0),
  interval_s int CHECK (interval_s IS NULL OR interval_s > 0),
  scoring_type text NOT NULL DEFAULT 'rounds_reps'
    CHECK (scoring_type IN ('time', 'rounds_reps', 'load', 'reps')),
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, community_id)
);

ALTER TABLE public.daily_wods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dw_select_member" ON public.daily_wods
  FOR SELECT TO authenticated USING (
    community_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = daily_wods.community_id AND cm.user_id = (select auth.uid())
    )
  );

CREATE POLICY "dw_insert_coach" ON public.daily_wods
  FOR INSERT TO authenticated WITH CHECK (
    community_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_id AND c.creator_id = (select auth.uid())
    )
  );

CREATE POLICY "dw_update_coach" ON public.daily_wods
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = community_id AND c.creator_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = community_id AND c.creator_id = (select auth.uid())
  ));

CREATE POLICY "dw_delete_coach" ON public.daily_wods
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_id AND c.creator_id = (select auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_daily_wods_date ON public.daily_wods (date DESC);

-- ============================================================================
-- 3. RPC: get_benchmark_leaderboard
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_benchmark_leaderboard(
  p_benchmark_key text,
  p_limit int DEFAULT 25
)
RETURNS TABLE(
  user_id uuid,
  username text,
  full_name text,
  avatar_url text,
  best_time_s int,
  best_reps int,
  total_attempts bigint,
  last_result_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    br.user_id,
    pf.username,
    pf.full_name,
    pf.avatar_url,
    min(br.result_time_s)::int AS best_time_s,
    max(br.result_reps)::int AS best_reps,
    count(*)::bigint AS total_attempts,
    max(br.created_at) AS last_result_at
  FROM public.benchmark_results br
  JOIN public.profiles pf ON pf.id = br.user_id
  WHERE br.benchmark_key = p_benchmark_key
    AND br.result_time_s IS NOT NULL
  GROUP BY br.user_id, pf.username, pf.full_name, pf.avatar_url
  ORDER BY best_time_s ASC NULLS LAST, total_attempts DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.get_benchmark_leaderboard(text, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_benchmark_leaderboard(text, int) TO authenticated;

-- ============================================================================
-- 4. RPC: get_my_prs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_my_prs(
  p_limit int DEFAULT 50
)
RETURNS TABLE(
  benchmark_key text,
  best_time_s int,
  best_reps int,
  is_current_pr boolean,
  total_attempts bigint,
  last_result_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path TO 'public'
AS $$
  WITH ranked AS (
    SELECT
      br.benchmark_key,
      br.result_time_s,
      br.result_reps,
      br.is_pr,
      br.created_at,
      row_number() OVER (PARTITION BY br.benchmark_key ORDER BY br.created_at DESC) = 1 AS is_latest
    FROM public.benchmark_results br
    WHERE br.user_id = (select auth.uid())
  )
  SELECT
    r.benchmark_key,
    min(r.result_time_s)::int AS best_time_s,
    max(r.result_reps)::int AS best_reps,
    bool_or(r.is_pr AND is_latest) AS is_current_pr,
    count(*)::bigint AS total_attempts,
    max(r.created_at) AS last_result_at
  FROM ranked r
  GROUP BY r.benchmark_key
  ORDER BY last_result_at DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_prs(int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_prs(int) TO authenticated;

-- ============================================================================
-- 5. RPC: get_daily_wod
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_daily_wod(
  p_date date DEFAULT CURRENT_DATE,
  p_community_id uuid DEFAULT NULL
)
RETURNS SETOF public.daily_wods
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.daily_wods
  WHERE date = p_date
    AND (p_community_id IS NULL OR community_id = p_community_id OR community_id IS NULL)
  ORDER BY community_id NULLS LAST, created_at DESC
  LIMIT 3;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_wod(date, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_daily_wod(date, uuid) TO authenticated;
