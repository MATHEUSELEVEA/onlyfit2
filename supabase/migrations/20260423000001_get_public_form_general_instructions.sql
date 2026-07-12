-- get_public_form_by_token: retornar general_instructions para anamnese
CREATE OR REPLACE FUNCTION public.get_public_form_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form record;
  v_coach record;
  v_photo_instructions TEXT;
  v_general_instructions TEXT;
  v_check_schema JSONB;
  v_check_title TEXT;
  v_periodicity_days INT;
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

  SELECT full_name, avatar_url, workspace_name INTO v_coach FROM public.profiles WHERE id = v_form.coach_id;

  IF v_form.form_type = 'anamnesis' THEN
    SELECT at.photo_instructions, at.general_instructions
    INTO v_photo_instructions, v_general_instructions
    FROM public.anamnesis_templates at
    WHERE at.is_active = true
      AND (at.tenant_id = v_form.coach_id OR at.tenant_id IS NULL)
    ORDER BY (at.tenant_id IS NOT NULL) DESC NULLS LAST, at.updated_at DESC
    LIMIT 1;
  ELSIF v_form.form_type = 'weekly_check' THEN
    SELECT ct.schema_json, ct.title, ct.periodicity_days
    INTO v_check_schema, v_check_title, v_periodicity_days
    FROM public.check_templates ct
    WHERE ct.tenant_id = v_form.coach_id AND ct.is_active = true
    ORDER BY ct.updated_at DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'id', v_form.id,
    'form_type', v_form.form_type,
    'student_id', v_form.student_id,
    'coach_id', v_form.coach_id,
    'coach_name', COALESCE(v_coach.full_name, ''),
    'coach_avatar', v_coach.avatar_url,
    'workspace_name', v_coach.workspace_name,
    'photo_instructions', v_photo_instructions,
    'general_instructions', v_general_instructions,
    'check_schema_json', v_check_schema,
    'check_title', v_check_title,
    'check_periodicity_days', v_periodicity_days
  );
END;
$$;
