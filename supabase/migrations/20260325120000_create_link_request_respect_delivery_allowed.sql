-- Enfileirar LINK_REQUEST só se pulse_flow_delivery_allowed (mantém INSERT em coach_student_link_requests).

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

    IF public.pulse_flow_delivery_allowed(v_coach_id, 'LINK_REQUEST'::text, v_student_id) THEN
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
    END IF;

    RETURN jsonb_build_object('ok', true, 'request_id', v_request_id);
END;
$$;
