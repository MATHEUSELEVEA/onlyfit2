-- OnlyFit Control: staff table, content reports, RLS, RPCs (Pulse)
-- Denúncias: feed, inbox, desafios, market, lives, comunidade (+ post_comment, user).

-- ---------------------------------------------------------------------------
-- platform_staff: apenas linhas explícitas; sem SELECT para authenticated na tabela
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_staff (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'super_admin'
    CHECK (role IN ('super_admin', 'admin', 'moderator', 'support')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.platform_staff IS 'Contas internas OnlyFit com acesso ao painel /control; manutenção via service_role ou SQL.';

ALTER TABLE public.platform_staff ENABLE ROW LEVEL SECURITY;

-- Sem políticas: utilizadores normais não leem nem escrevem (service_role ignora RLS).

CREATE OR REPLACE FUNCTION public.platform_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_staff ps
    WHERE ps.user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.platform_is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_is_staff() TO service_role;

-- ---------------------------------------------------------------------------
-- platform_content_reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  subject_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN (
    'post',
    'post_comment',
    'direct_message',
    'challenge',
    'challenge_run',
    'product',
    'user',
    'live_room',
    'community_post'
  )),
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'nudity_sexual',
    'violence',
    'hate_harassment',
    'dangerous_challenge',
    'self_harm_eating_disorder',
    'spam_scam',
    'other'
  )),
  description text,
  priority smallint NOT NULL DEFAULT 50,
  content_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_review',
    'resolved',
    'rejected',
    'escalated'
  )),
  reviewed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolution_notes text,
  resolution_action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_content_reports_description_len CHECK (
    description IS NULL OR char_length(description) <= 2000
  )
);

CREATE INDEX IF NOT EXISTS platform_content_reports_queue_idx
  ON public.platform_content_reports (status, priority ASC, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_content_reports_target_idx
  ON public.platform_content_reports (target_type, target_id);

CREATE INDEX IF NOT EXISTS platform_content_reports_subject_idx
  ON public.platform_content_reports (subject_user_id)
  WHERE subject_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS platform_content_reports_pending_dedup_idx
  ON public.platform_content_reports (reporter_user_id, target_type, target_id)
  WHERE status = 'pending';

COMMENT ON TABLE public.platform_content_reports IS 'Denúncias de conteúdo; fila só para platform_staff em /control.';

CREATE OR REPLACE FUNCTION public.platform_content_reports_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_content_reports_updated_at ON public.platform_content_reports;
CREATE TRIGGER trg_platform_content_reports_updated_at
  BEFORE UPDATE ON public.platform_content_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.platform_content_reports_set_updated_at();

ALTER TABLE public.platform_content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_content_reports_staff_select ON public.platform_content_reports;
DROP POLICY IF EXISTS platform_content_reports_staff_update ON public.platform_content_reports;

CREATE POLICY platform_content_reports_staff_select
  ON public.platform_content_reports
  FOR SELECT
  TO authenticated
  USING (public.platform_is_staff());

CREATE POLICY platform_content_reports_staff_update
  ON public.platform_content_reports
  FOR UPDATE
  TO authenticated
  USING (public.platform_is_staff())
  WITH CHECK (public.platform_is_staff());

-- INSERT apenas via submit_content_report (SECURITY DEFINER).

-- ---------------------------------------------------------------------------
-- submit_content_report
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_content_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_priority smallint;
  v_subject uuid;
  v_snapshot jsonb;
  v_desc text;
  new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_description IS NOT NULL AND char_length(p_description) > 2000 THEN
    RAISE EXCEPTION 'description_too_long' USING ERRCODE = 'P0001';
  END IF;
  v_desc := left(p_description, 2000);

  v_priority := CASE p_reason
    WHEN 'nudity_sexual' THEN 1
    WHEN 'violence' THEN 1
    WHEN 'self_harm_eating_disorder' THEN 1
    WHEN 'dangerous_challenge' THEN 2
    WHEN 'hate_harassment' THEN 2
    WHEN 'spam_scam' THEN 3
    ELSE 4
  END;

  IF p_target_type = 'post' THEN
    SELECT
      jsonb_build_object(
        'target_type', p_target_type,
        'target_id', p_target_id,
        'title', p.title,
        'description_excerpt', left(p.description, 500),
        'thumbnail_url', p.thumbnail_url,
        'video_url', p.video_url,
        'creator_id', p.creator_id,
        'deep_link_path', '/post/' || p.id::text
      ),
      p.creator_id
    INTO v_snapshot, v_subject
    FROM public.posts p
    WHERE p.id = p_target_id;

  ELSIF p_target_type = 'post_comment' THEN
    SELECT
      jsonb_build_object(
        'target_type', p_target_type,
        'target_id', p_target_id,
        'body_excerpt', left(pc.body, 1000),
        'post_id', pc.post_id,
        'author_id', pc.user_id,
        'deep_link_path', '/post/' || pc.post_id::text
      ),
      pc.user_id
    INTO v_snapshot, v_subject
    FROM public.post_comments pc
    WHERE pc.id = p_target_id;

  ELSIF p_target_type = 'direct_message' THEN
    SELECT
      jsonb_build_object(
        'target_type', p_target_type,
        'target_id', p_target_id,
        'body_excerpt', left(m.body, 2000),
        'sender_id', m.sender_id,
        'receiver_id', m.receiver_id,
        'deep_link_path', '/inbox'
      ),
      CASE
        WHEN m.sender_id = v_uid THEN m.receiver_id
        ELSE m.sender_id
      END
    INTO v_snapshot, v_subject
    FROM public.messages m
    WHERE m.id = p_target_id
      AND (m.sender_id = v_uid OR m.receiver_id = v_uid);

  ELSIF p_target_type = 'challenge' THEN
    SELECT
      jsonb_build_object(
        'target_type', p_target_type,
        'target_id', p_target_id,
        'title', c.title,
        'description_excerpt', left(c.description, 800),
        'creator_id', c.creator_id,
        'deep_link_path', '/challenges/' || c.id::text
      ),
      c.creator_id
    INTO v_snapshot, v_subject
    FROM public.challenges c
    WHERE c.id = p_target_id;

  ELSIF p_target_type = 'challenge_run' THEN
    SELECT
      jsonb_build_object(
        'target_type', p_target_type,
        'target_id', p_target_id,
        'challenge_id', r.challenge_id,
        'challenge_run_id', r.id,
        'title', c.title,
        'description_excerpt', left(c.description, 800),
        'creator_id', r.creator_id,
        'deep_link_path', '/challenges/' || r.id::text
      ),
      r.creator_id
    INTO v_snapshot, v_subject
    FROM public.challenge_runs r
    JOIN public.challenges c ON c.id = r.challenge_id
    WHERE r.id = p_target_id;

  ELSIF p_target_type = 'product' THEN
    SELECT
      jsonb_build_object(
        'target_type', p_target_type,
        'target_id', p_target_id,
        'name', pr.name,
        'description_excerpt', left(pr.description, 500),
        'creator_id', pr.creator_id,
        'thumbnail_url', pr.thumbnail_url,
        'deep_link_path', '/market/' || pr.id::text
      ),
      pr.creator_id
    INTO v_snapshot, v_subject
    FROM public.products pr
    WHERE pr.id = p_target_id;

  ELSIF p_target_type = 'live_room' THEN
    SELECT
      jsonb_build_object(
        'target_type', p_target_type,
        'target_id', p_target_id,
        'title', lr.title,
        'status', lr.status,
        'coach_id', lr.coach_id,
        'deep_link_path', '/coach/live'
      ),
      lr.coach_id
    INTO v_snapshot, v_subject
    FROM public.live_rooms lr
    WHERE lr.id = p_target_id;

  ELSIF p_target_type = 'community_post' THEN
    SELECT
      jsonb_build_object(
        'target_type', p_target_type,
        'target_id', p_target_id,
        'title', cp.title,
        'body_excerpt', left(cp.body, 800),
        'author_id', cp.author_id,
        'community_id', cp.community_id,
        'thumbnail_url', cp.thumbnail_url,
        'deep_link_path', '/community'
      ),
      cp.author_id
    INTO v_snapshot, v_subject
    FROM public.community_posts cp
    WHERE cp.id = p_target_id
      AND cp.deleted_at IS NULL;

  ELSIF p_target_type = 'user' THEN
    IF p_target_id = v_uid THEN
      RAISE EXCEPTION 'cannot_report_self' USING ERRCODE = 'P0001';
    END IF;
    SELECT
      jsonb_build_object(
        'target_type', p_target_type,
        'target_id', p_target_id,
        'username', pr.username,
        'full_name', pr.full_name,
        'deep_link_path', '/' || pr.username
      ),
      pr.id
    INTO v_snapshot, v_subject
    FROM public.profiles pr
    WHERE pr.id = p_target_id;

  ELSE
    RAISE EXCEPTION 'invalid_target_type' USING ERRCODE = 'P0001';
  END IF;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.platform_content_reports (
    reporter_user_id,
    subject_user_id,
    target_type,
    target_id,
    reason,
    description,
    priority,
    content_snapshot,
    status
  )
  VALUES (
    v_uid,
    v_subject,
    p_target_type,
    p_target_id,
    p_reason,
    v_desc,
    v_priority,
    v_snapshot,
    'pending'
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_content_report(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_content_report(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_content_report(text, uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- control_get_report_context (staff)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.control_get_report_context(p_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_content_reports%ROWTYPE;
  cur jsonb;
BEGIN
  IF NOT public.platform_is_staff() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.platform_content_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  cur := NULL;

  IF r.target_type = 'post' THEN
    SELECT to_jsonb(p.*) INTO cur FROM public.posts p WHERE p.id = r.target_id;
  ELSIF r.target_type = 'post_comment' THEN
    SELECT to_jsonb(pc.*) INTO cur FROM public.post_comments pc WHERE pc.id = r.target_id;
  ELSIF r.target_type = 'direct_message' THEN
    SELECT to_jsonb(m.*) INTO cur FROM public.messages m WHERE m.id = r.target_id;
  ELSIF r.target_type = 'challenge' THEN
    SELECT to_jsonb(c.*) INTO cur FROM public.challenges c WHERE c.id = r.target_id;
  ELSIF r.target_type = 'challenge_run' THEN
    SELECT to_jsonb(cr.*) INTO cur FROM public.challenge_runs cr WHERE cr.id = r.target_id;
  ELSIF r.target_type = 'product' THEN
    SELECT to_jsonb(pr.*) INTO cur FROM public.products pr WHERE pr.id = r.target_id;
  ELSIF r.target_type = 'live_room' THEN
    SELECT to_jsonb(lr.*) INTO cur FROM public.live_rooms lr WHERE lr.id = r.target_id;
  ELSIF r.target_type = 'community_post' THEN
    SELECT to_jsonb(cp.*) INTO cur FROM public.community_posts cp WHERE cp.id = r.target_id;
  ELSIF r.target_type = 'user' THEN
    SELECT to_jsonb(pu.*) INTO cur FROM public.profiles pu WHERE pu.id = r.target_id;
  END IF;

  RETURN jsonb_build_object(
    'report', to_jsonb(r),
    'content_snapshot', r.content_snapshot,
    'current_target', cur
  );
END;
$$;

REVOKE ALL ON FUNCTION public.control_get_report_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control_get_report_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.control_get_report_context(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- control_overview_stats, control_pulse_outbox_health, control_payments_snapshot
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.control_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF NOT public.platform_is_staff() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'profiles_total', (SELECT count(*)::bigint FROM public.profiles),
    'profiles_created_today', (
      SELECT count(*)::bigint FROM public.profiles p
      WHERE p.created_at >= day_start
    ),
    'workout_sessions_completed_today', (
      SELECT count(*)::bigint FROM public.workout_sessions ws
      WHERE ws.completed_at >= day_start
    ),
    'pending_content_reports', (
      SELECT count(*)::bigint FROM public.platform_content_reports cr
      WHERE cr.status = 'pending'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.control_overview_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control_overview_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.control_overview_stats() TO service_role;

CREATE OR REPLACE FUNCTION public.control_pulse_outbox_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.platform_is_staff() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
    FROM (
      SELECT o.status, count(*)::bigint AS cnt
      FROM public.pulse_action_outbox o
      GROUP BY o.status
    ) s
  );
END;
$$;

REVOKE ALL ON FUNCTION public.control_pulse_outbox_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control_pulse_outbox_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.control_pulse_outbox_health() TO service_role;

CREATE OR REPLACE FUNCTION public.control_payments_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  month_start date := date_trunc('month', (now() AT TIME ZONE 'UTC')::date)::date;
BEGIN
  IF NOT public.platform_is_staff() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'charges_paid_today_count', (
      SELECT count(*)::bigint FROM public.asaas_charges ac
      WHERE ac.payment_date = (now() AT TIME ZONE 'UTC')::date
        AND upper(ac.status::text) IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')
    ),
    'charges_paid_today_value', (
      SELECT coalesce(sum(ac.value), 0)::numeric
      FROM public.asaas_charges ac
      WHERE ac.payment_date = (now() AT TIME ZONE 'UTC')::date
        AND upper(ac.status::text) IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')
    ),
    'charges_paid_month_count', (
      SELECT count(*)::bigint FROM public.asaas_charges ac
      WHERE ac.payment_date >= month_start
        AND upper(ac.status::text) IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')
    ),
    'charges_paid_month_value', (
      SELECT coalesce(sum(ac.value), 0)::numeric
      FROM public.asaas_charges ac
      WHERE ac.payment_date >= month_start
        AND upper(ac.status::text) IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.control_payments_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control_payments_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.control_payments_snapshot() TO service_role;

-- ---------------------------------------------------------------------------
-- control_search_users (staff, MVP)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.control_search_users(p_query text, p_limit int DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim int := least(greatest(coalesce(p_limit, 24), 1), 100);
  q text := trim(coalesce(p_query, ''));
BEGIN
  IF NOT public.platform_is_staff() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF q = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(row_to_json(x))
      FROM (
        SELECT
          p.id,
          p.username,
          p.full_name,
          p.email,
          p.is_creator,
          p.created_at,
          p.language
        FROM public.profiles p
        WHERE
          p.username ILIKE '%' || q || '%'
          OR p.full_name ILIKE '%' || q || '%'
          OR (p.email IS NOT NULL AND p.email ILIKE '%' || q || '%')
        ORDER BY p.created_at DESC NULLS LAST
        LIMIT lim
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.control_search_users(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.control_search_users(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.control_search_users(text, int) TO service_role;
