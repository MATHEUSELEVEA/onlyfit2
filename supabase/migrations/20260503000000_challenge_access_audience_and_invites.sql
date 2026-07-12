DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'challenge_creation_mode') THEN
    CREATE TYPE public.challenge_creation_mode AS ENUM ('social', 'professional');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'challenge_access_audience') THEN
    CREATE TYPE public.challenge_access_audience AS ENUM ('public', 'students', 'subscribers', 'buyers', 'invite_only');
  END IF;
END $$;

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS creation_mode public.challenge_creation_mode NOT NULL DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS access_audience public.challenge_access_audience NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS share_code TEXT,
  ADD COLUMN IF NOT EXISTS requires_creator_approval BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.challenge_runs
  ADD COLUMN IF NOT EXISTS creation_mode public.challenge_creation_mode NOT NULL DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS access_audience public.challenge_access_audience NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS share_code TEXT,
  ADD COLUMN IF NOT EXISTS requires_creator_approval BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.generate_challenge_share_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  candidate TEXT;
BEGIN
  LOOP
    candidate := lower(encode(gen_random_bytes(5), 'hex'));
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.challenge_runs
      WHERE share_code = candidate
    );
  END LOOP;

  RETURN candidate;
END;
$$;

UPDATE public.challenges
SET creation_mode = CASE
      WHEN creation_mode IS NULL THEN 'professional'::public.challenge_creation_mode
      ELSE creation_mode
    END,
    access_audience = CASE
      WHEN challenge_type = 'coach_private'::public.challenge_type THEN 'students'::public.challenge_access_audience
      WHEN COALESCE(entry_price, 0) > 0 THEN 'buyers'::public.challenge_access_audience
      ELSE 'public'::public.challenge_access_audience
    END,
    requires_creator_approval = false
WHERE TRUE;

UPDATE public.challenge_runs
SET creation_mode = CASE
      WHEN creation_mode IS NULL THEN 'professional'::public.challenge_creation_mode
      ELSE creation_mode
    END,
    access_audience = CASE
      WHEN challenge_type = 'coach_private'::public.challenge_type THEN 'students'::public.challenge_access_audience
      WHEN COALESCE(entry_price, 0) > 0 THEN 'buyers'::public.challenge_access_audience
      ELSE 'public'::public.challenge_access_audience
    END,
    requires_creator_approval = false
WHERE TRUE;

UPDATE public.challenges
SET share_code = public.generate_challenge_share_code()
WHERE share_code IS NULL;

UPDATE public.challenge_runs
SET share_code = public.generate_challenge_share_code()
WHERE share_code IS NULL;

ALTER TABLE public.challenges
  ALTER COLUMN share_code SET DEFAULT public.generate_challenge_share_code();

ALTER TABLE public.challenge_runs
  ALTER COLUMN share_code SET DEFAULT public.generate_challenge_share_code();

CREATE UNIQUE INDEX IF NOT EXISTS challenges_share_code_key
  ON public.challenges (share_code)
  WHERE share_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS challenge_runs_share_code_key
  ON public.challenge_runs (share_code)
  WHERE share_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.challenge_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_run_id UUID NOT NULL REFERENCES public.challenge_runs(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  invite_code TEXT,
  request_message TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT challenge_join_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT challenge_join_requests_run_requester_key UNIQUE (challenge_run_id, requester_id)
);

CREATE INDEX IF NOT EXISTS challenge_join_requests_run_status_idx
  ON public.challenge_join_requests (challenge_run_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS challenge_join_requests_requester_status_idx
  ON public.challenge_join_requests (requester_id, status, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_challenge_join_requests ON public.challenge_join_requests;
CREATE TRIGGER set_updated_at_challenge_join_requests
BEFORE UPDATE ON public.challenge_join_requests
FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.user_has_challenge_payment_access(run_id UUID, actor_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.challenge_runs cr
    WHERE cr.id = run_id
      AND (
        cr.creator_id = actor_id
        OR EXISTS (
          SELECT 1
          FROM public.challenge_participants cp
          WHERE cp.challenge_run_id = cr.id
            AND cp.user_id = actor_id
            AND cp.payment_status IN ('not_required', 'paid', 'sponsored', 'confirmed')
        )
        OR EXISTS (
          SELECT 1
          FROM public.challenge_checkouts cc
          WHERE cc.challenge_run_id = cr.id
            AND cc.buyer_id = actor_id
            AND cc.status IN ('paid', 'confirmed', 'granted')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_challenge_subscriber(run_id UUID, actor_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.challenge_runs cr
    WHERE cr.id = run_id
      AND (
        EXISTS (
          SELECT 1
          FROM public.creator_memberships cm
          WHERE cm.creator_id = cr.creator_id
            AND cm.user_id = actor_id
            AND public.is_creator_membership_active(cm.status, cm.current_period_end, cm.grace_until)
        )
        OR EXISTS (
          SELECT 1
          FROM public.subscriptions s
          WHERE s.creator_id = cr.creator_id
            AND s.subscriber_id = actor_id
            AND s.status IN ('active', 'trialing')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_matches_challenge_audience(run_id UUID, actor_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.challenge_runs cr
    WHERE cr.id = run_id
      AND (
        cr.creator_id = actor_id
        OR (
          cr.access_audience = 'public'::public.challenge_access_audience
          AND cr.creation_mode = 'professional'::public.challenge_creation_mode
        )
        OR (
          cr.access_audience = 'students'::public.challenge_access_audience
          AND EXISTS (
            SELECT 1
            FROM public.coach_relationships rel
            WHERE rel.coach_id = cr.creator_id
              AND rel.student_id = actor_id
              AND rel.status = 'active'
          )
        )
        OR (
          cr.access_audience = 'subscribers'::public.challenge_access_audience
          AND public.user_is_challenge_subscriber(cr.id, actor_id)
        )
        OR (
          cr.access_audience = 'buyers'::public.challenge_access_audience
          AND public.user_has_challenge_payment_access(cr.id, actor_id)
        )
        OR (
          cr.access_audience = 'invite_only'::public.challenge_access_audience
          AND EXISTS (
            SELECT 1
            FROM public.challenge_join_requests cjr
            WHERE cjr.challenge_run_id = cr.id
              AND cjr.requester_id = actor_id
              AND cjr.status = 'approved'
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_view_challenge_run(run_id UUID, actor_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.challenge_runs cr
    WHERE cr.id = run_id
      AND (
        (
          cr.visibility = 'public'::public.challenge_visibility
          AND cr.access_audience = 'public'::public.challenge_access_audience
        )
        OR (
          actor_id IS NOT NULL
          AND (
            cr.creator_id = actor_id
            OR cr.access_audience = 'buyers'::public.challenge_access_audience
            OR EXISTS (
              SELECT 1
              FROM public.challenge_participants cp
              WHERE cp.challenge_run_id = cr.id
                AND cp.user_id = actor_id
            )
            OR public.user_matches_challenge_audience(cr.id, actor_id)
            OR cr.access_audience = 'invite_only'::public.challenge_access_audience
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_challenge_access(run_id UUID, actor_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.challenge_runs cr
    WHERE cr.id = run_id
      AND (
        cr.creator_id = actor_id
        OR EXISTS (
          SELECT 1
          FROM public.challenge_participants cp
          WHERE cp.challenge_run_id = cr.id
            AND cp.user_id = actor_id
        )
        OR (
          cr.access_audience = 'buyers'::public.challenge_access_audience
          AND public.user_has_challenge_payment_access(cr.id, actor_id)
        )
        OR (
          cr.access_audience <> 'buyers'::public.challenge_access_audience
          AND public.user_matches_challenge_audience(cr.id, actor_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_join_challenge_run(run_id UUID, actor_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.challenge_runs cr
    WHERE cr.id = run_id
      AND cr.status <> 'cancelled'::public.challenge_run_status
      AND (
        cr.creator_id = actor_id
        OR (
          cr.access_audience = 'buyers'::public.challenge_access_audience
          AND public.user_has_challenge_payment_access(cr.id, actor_id)
        )
        OR (
          cr.access_audience <> 'buyers'::public.challenge_access_audience
          AND public.user_matches_challenge_audience(cr.id, actor_id)
        )
      )
      AND (
        cr.requires_creator_approval = false
        OR cr.creator_id = actor_id
        OR EXISTS (
          SELECT 1
          FROM public.challenge_join_requests cjr
          WHERE cjr.challenge_run_id = cr.id
            AND cjr.requester_id = actor_id
            AND cjr.status = 'approved'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_request_challenge_access(run_id UUID, actor_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.challenge_runs cr
    WHERE cr.id = run_id
      AND actor_id IS NOT NULL
      AND cr.creator_id <> actor_id
      AND cr.access_audience = 'invite_only'::public.challenge_access_audience
      AND cr.requires_creator_approval = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.challenge_participants cp
        WHERE cp.challenge_run_id = cr.id
          AND cp.user_id = actor_id
      )
  );
$$;

ALTER TABLE public.challenge_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "challenge_runs_select" ON public.challenge_runs;
CREATE POLICY "challenge_runs_select"
  ON public.challenge_runs FOR SELECT
  USING (public.user_can_view_challenge_run(id, auth.uid()));

DROP POLICY IF EXISTS "challenges_select" ON public.challenges;
CREATE POLICY "challenges_select"
  ON public.challenges FOR SELECT
  USING (
    creator_id = auth.uid()
    OR (
      visibility = 'public'::public.challenge_visibility
      AND access_audience = 'public'::public.challenge_access_audience
    )
  );

DROP POLICY IF EXISTS "challenge_ai_insights_select" ON public.challenge_ai_insights;
CREATE POLICY "challenge_ai_insights_select"
  ON public.challenge_ai_insights FOR SELECT
  USING (public.user_has_challenge_access(challenge_run_id, auth.uid()));

DROP POLICY IF EXISTS "challenge_teams_select" ON public.challenge_teams;
CREATE POLICY "challenge_teams_select"
  ON public.challenge_teams FOR SELECT
  USING (public.user_has_challenge_access(challenge_run_id, auth.uid()));

DROP POLICY IF EXISTS "challenge_participants_select" ON public.challenge_participants;
CREATE POLICY "challenge_participants_select"
  ON public.challenge_participants FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.challenge_run_belongs_to_user(challenge_run_id, auth.uid())
  );

DROP POLICY IF EXISTS "challenge_participants_insert" ON public.challenge_participants;
CREATE POLICY "challenge_participants_insert"
  ON public.challenge_participants FOR INSERT
  WITH CHECK (
    (
      user_id = auth.uid()
      AND public.user_can_join_challenge_run(challenge_run_id, auth.uid())
    )
    OR public.challenge_run_belongs_to_user(challenge_run_id, auth.uid())
  );

DROP POLICY IF EXISTS "challenge_scores_select" ON public.challenge_scores;
CREATE POLICY "challenge_scores_select"
  ON public.challenge_scores FOR SELECT
  USING (public.user_has_challenge_access(challenge_run_id, auth.uid()));

DROP POLICY IF EXISTS "challenge_logs_select" ON public.challenge_logs;
CREATE POLICY "challenge_logs_select"
  ON public.challenge_logs FOR SELECT
  USING (public.user_has_challenge_access(challenge_run_id, auth.uid()));

DROP POLICY IF EXISTS "challenge_rewards_select" ON public.challenge_rewards;
CREATE POLICY "challenge_rewards_select"
  ON public.challenge_rewards FOR SELECT
  USING (
    (
      challenge_run_id IS NOT NULL
      AND public.user_can_view_challenge_run(challenge_run_id, auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.challenges c
      WHERE c.id = challenge_rewards.challenge_id
        AND c.creator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "challenge_comments_select" ON public.challenge_comments;
CREATE POLICY "challenge_comments_select"
  ON public.challenge_comments FOR SELECT
  USING (public.user_has_challenge_access(challenge_run_id, auth.uid()));

DROP POLICY IF EXISTS "challenge_reactions_select" ON public.challenge_reactions;
CREATE POLICY "challenge_reactions_select"
  ON public.challenge_reactions FOR SELECT
  USING (public.user_has_challenge_access(challenge_run_id, auth.uid()));

DROP POLICY IF EXISTS "challenge_join_requests_select_owner_or_creator" ON public.challenge_join_requests;
CREATE POLICY "challenge_join_requests_select_owner_or_creator"
  ON public.challenge_join_requests FOR SELECT
  USING (
    requester_id = auth.uid()
    OR public.challenge_run_belongs_to_user(challenge_run_id, auth.uid())
  );

DROP POLICY IF EXISTS "challenge_join_requests_insert_self" ON public.challenge_join_requests;
CREATE POLICY "challenge_join_requests_insert_self"
  ON public.challenge_join_requests FOR INSERT
  WITH CHECK (
    requester_id = auth.uid()
    AND public.user_can_request_challenge_access(challenge_run_id, auth.uid())
  );

DROP POLICY IF EXISTS "challenge_join_requests_update_requester_or_creator" ON public.challenge_join_requests;
CREATE POLICY "challenge_join_requests_update_requester_or_creator"
  ON public.challenge_join_requests FOR UPDATE
  USING (
    requester_id = auth.uid()
    OR public.challenge_run_belongs_to_user(challenge_run_id, auth.uid())
  )
  WITH CHECK (
    requester_id = auth.uid()
    OR public.challenge_run_belongs_to_user(challenge_run_id, auth.uid())
  );
