-- Melhorar submit_public_form_by_token: validação de photo_ids e vinculação garantida
-- Adiciona validação de que photo_ids pertencem ao student_id correto
-- Garante que fotos não estão já vinculadas a outra anamnese
-- Adiciona contagem de fotos vinculadas para verificação

CREATE OR REPLACE FUNCTION public.submit_public_form_by_token(p_token TEXT, p_data JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form record;
  v_template_id UUID;
  v_answers JSONB;
  v_raw_answers JSONB;
  v_legacy_answers JSONB;
  v_consent_lgpd JSONB;
  v_consent_text TEXT;
  v_consented_at TIMESTAMPTZ;
  v_submission_id UUID;
  v_check_template_id UUID;
  v_min_progress_photos INT;
  v_photo_count INT;
  v_photo_ids UUID[];
  v_valid_photo_count INT;
  v_linked_photo_count INT;
BEGIN
  SELECT * INTO v_form FROM public.patient_forms WHERE token = p_token LIMIT 1;

  IF v_form IS NULL THEN
    RAISE EXCEPTION 'Formulário não encontrado ou token inválido.';
  END IF;

  IF v_form.status != 'pending' THEN
    RAISE EXCEPTION 'Formulário já foi preenchido ou não está mais pendente.';
  END IF;

  IF v_form.expires_at < now() THEN
    UPDATE public.patient_forms SET status = 'expired' WHERE id = v_form.id;
    RAISE EXCEPTION 'O link para este formulário já expirou.';
  END IF;

  IF v_form.form_type = 'anamnesis' THEN
    v_template_id := v_form.anamnesis_template_id;

    IF v_template_id IS NULL THEN
      SELECT id INTO v_template_id
      FROM public.anamnesis_templates
      WHERE is_active = true
        AND (tenant_id = v_form.coach_id OR tenant_id IS NULL)
      ORDER BY (tenant_id IS NOT NULL) DESC NULLS LAST, updated_at DESC
      LIMIT 1;
    END IF;

    IF v_template_id IS NULL THEN
      v_template_id := 'a0000000-0000-4000-8000-000000000001'::UUID;
    END IF;

    v_raw_answers := COALESCE(p_data->'answers_json', '{}'::jsonb);
    IF jsonb_typeof(v_raw_answers) != 'object' THEN
      v_raw_answers := '{}'::jsonb;
    END IF;

    v_legacy_answers := jsonb_strip_nulls(
      jsonb_build_object(
        'submitted_via', 'public_link',
        'resumo_clinico', COALESCE(
          NULLIF(TRIM(COALESCE(v_raw_answers->>'resumo_clinico', '')), ''),
          NULLIF(TRIM(
            CONCAT_WS(E'\n',
              NULLIF(TRIM(COALESCE(v_raw_answers->>'health_conditions', p_data->'data'->>'health_conditions', '')), ''),
              NULLIF(TRIM(COALESCE(v_raw_answers->>'additional_notes', p_data->'data'->>'additional_notes', '')), '')
            )
          ), '')
        ),
        'restricoes', COALESCE(
          NULLIF(TRIM(COALESCE(v_raw_answers->>'restricoes', '')), ''),
          NULLIF(TRIM(COALESCE(v_raw_answers->>'allergies', p_data->'data'->>'allergies', '')), '')
        ),
        'medicacoes', COALESCE(
          NULLIF(TRIM(COALESCE(v_raw_answers->>'medicacoes', '')), ''),
          NULLIF(TRIM(COALESCE(v_raw_answers->>'medications', p_data->'data'->>'medications', '')), '')
        ),
        'goal', COALESCE(NULLIF(TRIM(COALESCE(v_raw_answers->>'goal', '')), ''), NULLIF(TRIM(COALESCE(p_data->'data'->>'goal', '')), '')),
        'meals_per_day', COALESCE(NULLIF(TRIM(COALESCE(v_raw_answers->>'meals_per_day', '')), ''), NULLIF(TRIM(COALESCE(p_data->'data'->>'meals_per_day', '')), '')),
        'water_intake', COALESCE(NULLIF(TRIM(COALESCE(v_raw_answers->>'water_intake', '')), ''), NULLIF(TRIM(COALESCE(p_data->'data'->>'water_intake', '')), '')),
        'training_type', COALESCE(NULLIF(TRIM(COALESCE(v_raw_answers->>'training_type', '')), ''), NULLIF(TRIM(COALESCE(p_data->'data'->>'training_type', '')), '')),
        'training_frequency', COALESCE(NULLIF(TRIM(COALESCE(v_raw_answers->>'training_frequency', '')), ''), NULLIF(TRIM(COALESCE(p_data->'data'->>'training_frequency', '')), ''))
      )
    );

    v_answers := v_legacy_answers || v_raw_answers;
    IF p_data ? 'consent_lgpd' THEN
      v_answers := v_answers || jsonb_build_object('consent_lgpd', p_data->'consent_lgpd');
    END IF;

    INSERT INTO public.anamnesis_submissions (
      tenant_id,
      student_id,
      template_id,
      answers_json,
      submitted_at,
      status
    ) VALUES (
      v_form.coach_id,
      v_form.student_id,
      v_template_id,
      v_answers,
      now(),
      'submitted'
    )
    RETURNING id INTO v_submission_id;

    -- Validação e vinculação melhorada de fotos
    IF p_data ? 'photo_ids' AND jsonb_typeof(p_data->'photo_ids') = 'array' AND jsonb_array_length(p_data->'photo_ids') > 0 THEN
      -- Converter photo_ids para array UUID
      SELECT ARRAY(
        SELECT elem::UUID 
        FROM jsonb_array_elements_text(p_data->'photo_ids') AS elem
      ) INTO v_photo_ids;

      -- Validar que todas as fotos pertencem ao student_id correto
      SELECT COUNT(*) INTO v_valid_photo_count
      FROM public.student_progress_photos
      WHERE id = ANY(v_photo_ids)
        AND student_id = v_form.student_id;

      IF v_valid_photo_count != array_length(v_photo_ids, 1) THEN
        RAISE EXCEPTION 'Uma ou mais fotos não pertencem a este aluno ou não foram encontradas.';
      END IF;

      -- Validar que as fotos não estão já vinculadas a outra anamnese
      SELECT COUNT(*) INTO v_linked_photo_count
      FROM public.student_progress_photos
      WHERE id = ANY(v_photo_ids)
        AND anamnesis_submission_id IS NOT NULL
        AND anamnesis_submission_id != v_submission_id;

      IF v_linked_photo_count > 0 THEN
        RAISE EXCEPTION 'Uma ou mais fotos já estão vinculadas a outra anamnese.';
      END IF;

      -- Vincular fotos à anamnese
      UPDATE public.student_progress_photos
      SET anamnesis_submission_id = v_submission_id
      WHERE id = ANY(v_photo_ids)
        AND student_id = v_form.student_id
        AND (anamnesis_submission_id IS NULL OR anamnesis_submission_id = v_submission_id);

      -- Verificar quantas fotos foram realmente vinculadas
      GET DIAGNOSTICS v_linked_photo_count = ROW_COUNT;
      
      IF v_linked_photo_count != array_length(v_photo_ids, 1) THEN
        -- Log warning mas não falha - pode ser que algumas já estavam vinculadas
        RAISE WARNING 'Apenas % de % fotos foram vinculadas à anamnese.', v_linked_photo_count, array_length(v_photo_ids, 1);
      END IF;
    END IF;

    IF p_data ? 'consent_lgpd' THEN
      v_consent_lgpd := p_data->'consent_lgpd';
      v_consent_text := COALESCE(v_consent_lgpd->>'consent_text', 'Autorizo o compartilhamento dos dados de saúde com o profissional para fins de acompanhamento.');
      v_consented_at := COALESCE(
        (v_consent_lgpd->>'consented_at')::TIMESTAMPTZ,
        now()
      );

      INSERT INTO public.data_consents (form_id, student_id, tenant_id, consent_type, consent_version, consent_text, consented_at, metadata)
      VALUES (
        v_form.id,
        v_form.student_id,
        v_form.coach_id,
        'anamnesis_public_lgpd',
        '1.0',
        v_consent_text,
        v_consented_at,
        jsonb_build_object('form_type', v_form.form_type, 'anamnesis_template_id', v_template_id)
      )
      ON CONFLICT DO NOTHING;

      INSERT INTO public.consent_records (user_id, consent_type, consent_version, accepted, accepted_at, consent_text)
      VALUES (
        v_form.student_id,
        'health_data_sharing',
        '1.0',
        true,
        v_consented_at,
        v_consent_text
      )
      ON CONFLICT DO NOTHING;

      UPDATE public.user_health_context
      SET
        health_consent_given_at = v_consented_at,
        health_consent_version = '1.0',
        updated_at = now()
      WHERE user_id = v_form.student_id AND tenant_id = v_form.coach_id
        AND (health_consent_given_at IS NULL OR health_consent_given_at < v_consented_at);
    END IF;
  ELSIF v_form.form_type = 'weekly_check' THEN
    SELECT id INTO v_check_template_id
    FROM public.check_templates
    WHERE tenant_id = v_form.coach_id AND is_active = true
    ORDER BY updated_at DESC
    LIMIT 1;

    IF v_check_template_id IS NULL THEN
      RAISE EXCEPTION 'Nenhum template de check ativo para este profissional.';
    END IF;

    v_answers := COALESCE(p_data->'answers_json', '{}');
    IF jsonb_typeof(v_answers) != 'object' THEN
      v_answers := '{}';
    END IF;

    INSERT INTO public.check_submissions (
      tenant_id,
      student_id,
      patient_form_id,
      template_id,
      answers_json,
      submitted_at,
      status
    ) VALUES (
      v_form.coach_id,
      v_form.student_id,
      v_form.id,
      v_check_template_id,
      v_answers,
      now(),
      'submitted'
    )
    RETURNING id INTO v_submission_id;

    -- Validação e vinculação melhorada de fotos para weekly_check
    IF p_data ? 'photo_ids' AND jsonb_typeof(p_data->'photo_ids') = 'array' AND jsonb_array_length(p_data->'photo_ids') > 0 THEN
      SELECT ARRAY(
        SELECT elem::UUID 
        FROM jsonb_array_elements_text(p_data->'photo_ids') AS elem
      ) INTO v_photo_ids;

      SELECT COUNT(*) INTO v_valid_photo_count
      FROM public.student_progress_photos
      WHERE id = ANY(v_photo_ids)
        AND student_id = v_form.student_id;

      IF v_valid_photo_count != array_length(v_photo_ids, 1) THEN
        RAISE EXCEPTION 'Uma ou mais fotos não pertencem a este aluno ou não foram encontradas.';
      END IF;

      SELECT COUNT(*) INTO v_linked_photo_count
      FROM public.student_progress_photos
      WHERE id = ANY(v_photo_ids)
        AND check_submission_id IS NOT NULL
        AND check_submission_id != v_submission_id;

      IF v_linked_photo_count > 0 THEN
        RAISE EXCEPTION 'Uma ou mais fotos já estão vinculadas a outro check.';
      END IF;

      UPDATE public.student_progress_photos
      SET check_submission_id = v_submission_id
      WHERE id = ANY(v_photo_ids)
        AND student_id = v_form.student_id
        AND (check_submission_id IS NULL OR check_submission_id = v_submission_id);

      GET DIAGNOSTICS v_linked_photo_count = ROW_COUNT;
      
      IF v_linked_photo_count != array_length(v_photo_ids, 1) THEN
        RAISE WARNING 'Apenas % de % fotos foram vinculadas ao check.', v_linked_photo_count, array_length(v_photo_ids, 1);
      END IF;
    END IF;
  END IF;

  UPDATE public.patient_forms
  SET
    status = 'completed',
    submitted_data = p_data,
    submitted_at = now()
  WHERE id = v_form.id;
END;
$$;

COMMENT ON FUNCTION public.submit_public_form_by_token IS 'Submete formulário público (anamnese ou weekly_check) com validação melhorada de photo_ids e vinculação garantida.';
