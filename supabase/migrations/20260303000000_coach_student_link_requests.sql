-- CPF link request flow: solicitacao de vinculo com aprovacao do aluno
-- Usuarios veem "coach"; no banco a entidade e creator (coach_id = auth.uid()).

-- 1. Tabela coach_student_link_requests
CREATE TABLE IF NOT EXISTS public.coach_student_link_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
    expires_at TIMESTAMPTZ NOT NULL,
    context JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(coach_id, student_id)
);

-- Apenas um request pendente por (coach_id, student_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_student_link_requests_one_pending
    ON public.coach_student_link_requests (coach_id, student_id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_coach_student_link_requests_coach_status
    ON public.coach_student_link_requests (coach_id, status);
CREATE INDEX IF NOT EXISTS idx_coach_student_link_requests_student_status
    ON public.coach_student_link_requests (student_id, status);

COMMENT ON TABLE public.coach_student_link_requests IS 'Solicitacoes de vinculo coach-aluno; aluno aprova ou recusa. CPF so para lookup (cpf_hash), nunca exposto.';

-- Trigger updated_at (usa funcao existente)
DROP TRIGGER IF EXISTS set_updated_at_coach_student_link_requests ON public.coach_student_link_requests;
CREATE TRIGGER set_updated_at_coach_student_link_requests
    BEFORE UPDATE ON public.coach_student_link_requests
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.coach_student_link_requests ENABLE ROW LEVEL SECURITY;

-- RLS: SELECT apenas para coach_id ou student_id = auth.uid(); INSERT/UPDATE so via RPC
DROP POLICY IF EXISTS "Coach or student can select own link requests" ON public.coach_student_link_requests;
CREATE POLICY "Coach or student can select own link requests"
    ON public.coach_student_link_requests FOR SELECT
    USING (auth.uid() = coach_id OR auth.uid() = student_id);

-- Nenhuma policy para INSERT/UPDATE; apenas RPCs SECURITY DEFINER fazem alteracoes
-- (create_link_request, accept_link_request, decline_link_request, expire_old_link_requests)

-- 2. RPC: lookup_by_cpf_hash - retorna { "exists": boolean }, sem expor student_id
CREATE OR REPLACE FUNCTION public.lookup_by_cpf_hash(p_cpf_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    IF p_cpf_hash IS NULL OR trim(p_cpf_hash) = '' THEN
        RETURN jsonb_build_object('exists', false);
    END IF;
    SELECT EXISTS(
        SELECT 1 FROM public.profiles WHERE cpf_hash = p_cpf_hash LIMIT 1
    ) INTO v_exists;
    RETURN jsonb_build_object('exists', v_exists);
END;
$$;

-- 3. RPC: create_link_request - coach_id = auth.uid(), insere request e notifica
CREATE OR REPLACE FUNCTION public.create_link_request(p_cpf_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_id UUID := auth.uid();
    v_student_id UUID;
    v_request_id UUID;
    v_existing_id UUID;
    v_already_linked BOOLEAN;
    v_coach_name TEXT;
    v_message TEXT;
BEGIN
    IF v_coach_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    IF p_cpf_hash IS NULL OR trim(p_cpf_hash) = '' THEN
        RAISE EXCEPTION 'cpf_hash required';
    END IF;

    SELECT id INTO v_student_id
    FROM public.profiles
    WHERE cpf_hash = p_cpf_hash
    LIMIT 1;
    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'cpf_not_found');
    END IF;

    IF v_student_id = v_coach_id THEN
        RAISE EXCEPTION 'Cannot link to yourself';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.coach_relationships
        WHERE coach_id = v_coach_id AND student_id = v_student_id
          AND status IN ('active', 'paused', 'pending_payment')
    ) INTO v_already_linked;
    IF v_already_linked THEN
        RETURN jsonb_build_object('ok', false, 'error', 'already_linked');
    END IF;

    SELECT id INTO v_existing_id
    FROM public.coach_student_link_requests
    WHERE coach_id = v_coach_id AND student_id = v_student_id AND status = 'pending'
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'request_id', v_existing_id, 'already_pending', true);
    END IF;

    INSERT INTO public.coach_student_link_requests (coach_id, student_id, status, expires_at)
    VALUES (v_coach_id, v_student_id, 'pending', now() + interval '7 days')
    RETURNING id INTO v_request_id;

    SELECT full_name INTO v_coach_name FROM public.profiles WHERE id = v_coach_id LIMIT 1;
    v_message := COALESCE(trim(v_coach_name), 'Um coach') || ' solicitou te vincular como aluno. Abra o app para aprovar ou recusar.';
    INSERT INTO public.pulse_action_outbox (
        student_id, coach_id, trigger_type, context_data, generated_message, status
    ) VALUES (
        v_student_id,
        v_coach_id,
        'LINK_REQUEST',
        jsonb_build_object('request_id', v_request_id, 'app_path', '/solicitacoes-vinculo'),
        v_message,
        'QUEUED_FOR_DELIVERY'
    );

    RETURN jsonb_build_object('ok', true, 'request_id', v_request_id);
END;
$$;

-- 4. RPC: accept_link_request - so o aluno (student_id = auth.uid())
CREATE OR REPLACE FUNCTION public.accept_link_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := auth.uid();
    v_coach_id UUID;
    v_status TEXT;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    IF p_request_id IS NULL THEN
        RAISE EXCEPTION 'request_id required';
    END IF;

    SELECT coach_id, status INTO v_coach_id, v_status
    FROM public.coach_student_link_requests
    WHERE id = p_request_id AND student_id = v_student_id
    LIMIT 1;
    IF v_coach_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
    END IF;
    IF v_status <> 'pending' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'request_not_pending');
    END IF;

    UPDATE public.coach_student_link_requests
    SET status = 'accepted', updated_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.coach_relationships (coach_id, student_id, status, billing_mode)
    VALUES (v_coach_id, v_student_id, 'active', 'manual')
    ON CONFLICT (coach_id, student_id) DO UPDATE
    SET status = 'active', updated_at = now();

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5. RPC: decline_link_request - so o aluno
CREATE OR REPLACE FUNCTION public.decline_link_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := auth.uid();
    v_found BOOLEAN;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    IF p_request_id IS NULL THEN
        RAISE EXCEPTION 'request_id required';
    END IF;

    UPDATE public.coach_student_link_requests
    SET status = 'declined', updated_at = now()
    WHERE id = p_request_id AND student_id = v_student_id AND status = 'pending';
    GET DIAGNOSTICS v_found = ROW_COUNT;
    IF NOT v_found THEN
        RETURN jsonb_build_object('ok', false, 'error', 'request_not_found_or_not_pending');
    END IF;
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 6. RPC: expire_old_link_requests - para cron
CREATE OR REPLACE FUNCTION public.expire_old_link_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.coach_student_link_requests
    SET status = 'expired', updated_at = now()
    WHERE status = 'pending' AND expires_at < now();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.lookup_by_cpf_hash(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_link_request(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_link_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_link_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_link_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_link_requests() TO service_role;
