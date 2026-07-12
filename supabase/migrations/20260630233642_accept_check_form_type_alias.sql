-- Aceita "check" como alias público/canônico de produto para o formulário periódico.
-- Internamente mantemos patient_forms.form_type = 'periodic_check' para não quebrar
-- constraints, dados históricos e consumidores existentes.
CREATE OR REPLACE FUNCTION public.create_patient_form(p_student_id uuid, p_form_type text, p_expires_in_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_coach_id UUID;
  v_form_id UUID;
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
  v_storage_form_type TEXT;
  v_anamnesis_template_id UUID;
  v_check_template_id UUID;
  v_check_schema JSONB;
  v_check_title TEXT;
  v_check_periodicity_days INT;
  v_check_ask_progress_photos BOOLEAN;
  v_check_progress_photo_instructions TEXT;
  v_check_min_progress_photos INT;
BEGIN
  v_coach_id := auth.uid();
  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado.';
  END IF;

  IF p_form_type IS NULL OR p_form_type NOT IN ('anamnesis', 'check', 'check_in', 'weekly_check', 'periodic_check') THEN
    RAISE EXCEPTION 'form_type deve ser anamnesis, check, check_in ou periodic_check.';
  END IF;

  v_storage_form_type := CASE
    WHEN p_form_type IN ('check', 'weekly_check') THEN 'periodic_check'
    ELSE p_form_type
  END;

  IF p_expires_in_days IS NULL OR p_expires_in_days < 1 THEN
    p_expires_in_days := 7;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.coach_relationships
    WHERE coach_id = v_coach_id AND student_id = p_student_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Vínculo ativo com este aluno não encontrado.';
  END IF;

  IF v_storage_form_type = 'anamnesis' THEN
    SELECT id INTO v_anamnesis_template_id
    FROM public.anamnesis_templates
    WHERE is_active = true
      AND (tenant_id = v_coach_id OR tenant_id IS NULL)
    ORDER BY (tenant_id IS NOT NULL) DESC NULLS LAST, updated_at DESC
    LIMIT 1;

    IF v_anamnesis_template_id IS NULL THEN
      v_anamnesis_template_id := 'a0000000-0000-4000-8000-000000000001'::UUID;
    END IF;
  ELSIF v_storage_form_type = 'periodic_check' THEN
    SELECT
      id, schema_json, title, periodicity_days,
      ask_progress_photos, progress_photo_instructions, min_progress_photos
    INTO
      v_check_template_id, v_check_schema, v_check_title, v_check_periodicity_days,
      v_check_ask_progress_photos, v_check_progress_photo_instructions, v_check_min_progress_photos
    FROM public.check_templates
    WHERE tenant_id = v_coach_id AND is_active = true
    ORDER BY updated_at DESC
    LIMIT 1;

    IF v_check_template_id IS NULL THEN
      RAISE EXCEPTION 'Nenhum modelo de check ativo para este profissional.';
    END IF;
  END IF;

  v_expires_at := now() + (p_expires_in_days || ' days')::INTERVAL;
  v_token := encode(gen_random_bytes(16), 'hex');

  INSERT INTO public.patient_forms (
    student_id, coach_id, form_type, token, expires_at,
    anamnesis_template_id, check_template_id, check_template_snapshot, check_template_title,
    check_periodicity_days, check_ask_progress_photos, check_progress_photo_instructions, check_min_progress_photos
  )
  VALUES (
    p_student_id, v_coach_id, v_storage_form_type, v_token, v_expires_at,
    v_anamnesis_template_id, v_check_template_id, v_check_schema, v_check_title,
    v_check_periodicity_days, v_check_ask_progress_photos, v_check_progress_photo_instructions, v_check_min_progress_photos
  )
  RETURNING id, token INTO v_form_id, v_token;

  RETURN jsonb_build_object('id', v_form_id, 'token', v_token);
END;
$$;

COMMENT ON FUNCTION public.create_patient_form(uuid, text, integer)
IS 'Cria link público de formulário. Aceita check como alias de periodic_check e mantém compatibilidade com aliases legados.';
