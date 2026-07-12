ALTER TABLE public.challenges
  DROP CONSTRAINT IF EXISTS challenges_buyers_require_price_check;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_buyers_require_price_check
  CHECK (
    access_audience <> 'buyers'::public.challenge_access_audience
    OR COALESCE(entry_price, 0) > 0
  ) NOT VALID;

ALTER TABLE public.challenges
  VALIDATE CONSTRAINT challenges_buyers_require_price_check;

ALTER TABLE public.challenge_runs
  DROP CONSTRAINT IF EXISTS challenge_runs_buyers_require_price_check;

ALTER TABLE public.challenge_runs
  ADD CONSTRAINT challenge_runs_buyers_require_price_check
  CHECK (
    access_audience <> 'buyers'::public.challenge_access_audience
    OR COALESCE(entry_price, 0) > 0
  ) NOT VALID;

ALTER TABLE public.challenge_runs
  VALIDATE CONSTRAINT challenge_runs_buyers_require_price_check;

CREATE OR REPLACE FUNCTION public.user_has_visible_challenge_join_request(run_id UUID, actor_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.challenge_join_requests cjr
    WHERE cjr.challenge_run_id = run_id
      AND cjr.requester_id = actor_id
      AND cjr.status IN ('pending', 'approved')
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
            OR EXISTS (
              SELECT 1
              FROM public.challenge_participants cp
              WHERE cp.challenge_run_id = cr.id
                AND cp.user_id = actor_id
            )
            OR (
              cr.creation_mode = 'professional'::public.challenge_creation_mode
              AND cr.access_audience <> 'invite_only'::public.challenge_access_audience
            )
            OR (
              cr.access_audience = 'invite_only'::public.challenge_access_audience
              AND public.user_has_visible_challenge_join_request(cr.id, actor_id)
            )
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_challenge_run_invite_preview(
  p_run_id UUID,
  p_invite_code TEXT
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH selected_run AS (
    SELECT cr.*
    FROM public.challenge_runs cr
    WHERE cr.id = p_run_id
      AND cr.access_audience = 'invite_only'::public.challenge_access_audience
      AND p_invite_code IS NOT NULL
      AND cr.share_code = p_invite_code
    LIMIT 1
  ),
  creator_profile AS (
    SELECT
      p.id,
      p.full_name,
      p.username,
      p.avatar_url
    FROM public.profiles p
    JOIN selected_run sr ON sr.creator_id = p.id
  ),
  reward_rows AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'description', r.description,
        'reward_type', r.reward_type,
        'provider_name', r.provider_name,
        'reward_value', r.reward_value,
        'currency', r.currency,
        'coupon_code', r.coupon_code,
        'is_featured', r.is_featured
      )
      ORDER BY r.is_featured DESC, r.created_at ASC
    ) AS rewards
    FROM public.challenge_rewards r
    JOIN selected_run sr ON sr.id = r.challenge_run_id
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM selected_run) THEN (
      SELECT to_jsonb(sr.*)
        || jsonb_build_object(
          'profiles',
          COALESCE((SELECT to_jsonb(cp.*) FROM creator_profile cp), 'null'::jsonb),
          'challenge_rewards',
          COALESCE((SELECT rewards FROM reward_rows), '[]'::jsonb)
        )
      FROM selected_run sr
    )
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_challenge_join_request_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_run public.challenge_runs%ROWTYPE;
  v_is_creator BOOLEAN := false;
BEGIN
  SELECT *
  INTO v_run
  FROM public.challenge_runs
  WHERE id = COALESCE(NEW.challenge_run_id, OLD.challenge_run_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Desafio não encontrado para esta solicitação.';
  END IF;

  v_is_creator := v_actor_id IS NOT NULL AND v_run.creator_id = v_actor_id;

  IF TG_OP = 'INSERT' THEN
    IF v_actor_id IS NULL OR NEW.requester_id <> v_actor_id THEN
      RAISE EXCEPTION 'Somente o próprio usuário pode criar a solicitação.';
    END IF;

    IF v_run.access_audience = 'invite_only'::public.challenge_access_audience
      AND COALESCE(NEW.invite_code, '') <> COALESCE(v_run.share_code, '__invalid__') THEN
      RAISE EXCEPTION 'Convite inválido para esse desafio social.';
    END IF;

    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;

  IF v_actor_id = OLD.requester_id AND NOT v_is_creator THEN
    IF NEW.requester_id <> OLD.requester_id OR NEW.challenge_run_id <> OLD.challenge_run_id THEN
      RAISE EXCEPTION 'Não é permitido alterar o dono nem o desafio da solicitação.';
    END IF;

    IF NEW.status = 'cancelled' THEN
      IF OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'Apenas solicitações pendentes podem ser canceladas.';
      END IF;

      IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
        RAISE EXCEPTION 'O solicitante não pode revisar a própria solicitação.';
      END IF;

      RETURN NEW;
    END IF;

    IF NEW.status = 'pending' THEN
      IF OLD.status NOT IN ('pending', 'rejected', 'cancelled') THEN
        RAISE EXCEPTION 'Não é possível reenviar uma solicitação já aprovada.';
      END IF;

      IF COALESCE(NEW.invite_code, '') <> COALESCE(v_run.share_code, '__invalid__') THEN
        RAISE EXCEPTION 'Convite inválido para reenviar a solicitação.';
      END IF;

      NEW.reviewed_by := NULL;
      NEW.reviewed_at := NULL;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'O solicitante só pode cancelar ou reenviar a própria solicitação.';
  END IF;

  IF v_is_creator THEN
    IF NEW.requester_id <> OLD.requester_id OR NEW.challenge_run_id <> OLD.challenge_run_id THEN
      RAISE EXCEPTION 'Não é permitido alterar o dono nem o desafio da solicitação.';
    END IF;

    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Somente solicitações pendentes podem ser moderadas.';
    END IF;

    IF NEW.status NOT IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'O criador só pode aprovar ou rejeitar solicitações.';
    END IF;

    NEW.reviewed_by := v_actor_id;
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Você não tem permissão para alterar essa solicitação.';
END;
$$;

DROP TRIGGER IF EXISTS enforce_challenge_join_request_write ON public.challenge_join_requests;
CREATE TRIGGER enforce_challenge_join_request_write
BEFORE INSERT OR UPDATE ON public.challenge_join_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_challenge_join_request_write();

DROP POLICY IF EXISTS "challenge_join_requests_update_requester_or_creator" ON public.challenge_join_requests;
DROP POLICY IF EXISTS "challenge_join_requests_update_requester_self" ON public.challenge_join_requests;
DROP POLICY IF EXISTS "challenge_join_requests_update_creator_review" ON public.challenge_join_requests;

CREATE POLICY "challenge_join_requests_update_requester_self"
  ON public.challenge_join_requests FOR UPDATE
  USING (requester_id = auth.uid())
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "challenge_join_requests_update_creator_review"
  ON public.challenge_join_requests FOR UPDATE
  USING (public.challenge_run_belongs_to_user(challenge_run_id, auth.uid()))
  WITH CHECK (public.challenge_run_belongs_to_user(challenge_run_id, auth.uid()));
