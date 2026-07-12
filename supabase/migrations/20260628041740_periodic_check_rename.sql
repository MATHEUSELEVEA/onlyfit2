-- Check "semanal" -> "periódico": renomeia o identificador canônico de form_type
-- 'weekly_check' para 'periodic_check' (a periodicidade real já vive em
-- check_templates.periodicity_days). Migração retrocompatível e idempotente:
--   • a constraint passa a aceitar AMBOS durante a transição (frontend antigo ainda
--     manda 'weekly_check' até o deploy);
--   • as 3 RPCs SECURITY DEFINER passam a ramificar em IN ('weekly_check','periodic_check');
--   • linhas históricas são canonicalizadas para 'periodic_check'.
-- Um migration de limpeza posterior remove 'weekly_check' da constraint após o deploy do front.

-- 1) Constraint aceita ambos (transição) ----------------------------------------
ALTER TABLE public.patient_forms DROP CONSTRAINT IF EXISTS patient_forms_form_type_check;
ALTER TABLE public.patient_forms
  ADD CONSTRAINT patient_forms_form_type_check
  CHECK (form_type = ANY (ARRAY['anamnesis'::text, 'check_in'::text, 'weekly_check'::text, 'periodic_check'::text]));

-- 2) RPC create_patient_form — aceita ambos na entrada, mantém o valor recebido ---
CREATE OR REPLACE FUNCTION public.create_patient_form(p_student_id uuid, p_form_type text, p_expires_in_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_coach_id UUID;
  v_form_id UUID;
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
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

  IF p_form_type IS NULL OR p_form_type NOT IN ('anamnesis', 'check_in', 'weekly_check', 'periodic_check') THEN
    RAISE EXCEPTION 'form_type deve ser anamnesis, check_in ou periodic_check.';
  END IF;

  IF p_expires_in_days IS NULL OR p_expires_in_days < 1 THEN
    p_expires_in_days := 7;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.coach_relationships
    WHERE coach_id = v_coach_id AND student_id = p_student_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Vínculo ativo com este aluno não encontrado.';
  END IF;

  IF p_form_type = 'anamnesis' THEN
    SELECT id INTO v_anamnesis_template_id
    FROM public.anamnesis_templates
    WHERE is_active = true
      AND (tenant_id = v_coach_id OR tenant_id IS NULL)
    ORDER BY (tenant_id IS NOT NULL) DESC NULLS LAST, updated_at DESC
    LIMIT 1;

    IF v_anamnesis_template_id IS NULL THEN
      v_anamnesis_template_id := 'a0000000-0000-4000-8000-000000000001'::UUID;
    END IF;
  ELSIF p_form_type IN ('weekly_check', 'periodic_check') THEN
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
      RAISE EXCEPTION 'Nenhum template de check ativo para este profissional.';
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
    p_student_id, v_coach_id, p_form_type, v_token, v_expires_at,
    v_anamnesis_template_id, v_check_template_id, v_check_schema, v_check_title,
    v_check_periodicity_days, v_check_ask_progress_photos, v_check_progress_photo_instructions, v_check_min_progress_photos
  )
  RETURNING id, token INTO v_form_id, v_token;

  RETURN jsonb_build_object('id', v_form_id, 'token', v_token);
END;
$$;

-- 3) RPC get_public_form_by_token — ramifica em ambos ---------------------------
CREATE OR REPLACE FUNCTION public.get_public_form_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_form record;
  v_coach record;
  v_photo_instructions TEXT;
  v_general_instructions TEXT;
  v_anamnesis_template_id UUID;
  v_anamnesis_title TEXT;
  v_anamnesis_schema JSONB;
  v_anamnesis_template_source TEXT;
  v_check_template_id UUID;
  v_check_schema JSONB;
  v_check_title TEXT;
  v_periodicity_days INT;
  v_check_ask_progress_photos BOOLEAN;
  v_check_progress_photo_instructions TEXT;
  v_check_min_progress_photos INT;
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
    IF v_form.anamnesis_template_id IS NOT NULL THEN
      SELECT at.id, at.title, at.schema_json, at.photo_instructions, at.general_instructions,
             CASE WHEN at.tenant_id = v_form.coach_id THEN 'coach' ELSE 'global' END
      INTO v_anamnesis_template_id, v_anamnesis_title, v_anamnesis_schema, v_photo_instructions, v_general_instructions, v_anamnesis_template_source
      FROM public.anamnesis_templates at
      WHERE at.id = v_form.anamnesis_template_id AND at.is_active = true
      LIMIT 1;
    END IF;

    IF v_anamnesis_template_id IS NULL THEN
      SELECT at.id, at.title, at.schema_json, at.photo_instructions, at.general_instructions,
             CASE WHEN at.tenant_id = v_form.coach_id THEN 'coach' ELSE 'global' END
      INTO v_anamnesis_template_id, v_anamnesis_title, v_anamnesis_schema, v_photo_instructions, v_general_instructions, v_anamnesis_template_source
      FROM public.anamnesis_templates at
      WHERE at.is_active = true AND (at.tenant_id = v_form.coach_id OR at.tenant_id IS NULL)
      ORDER BY (at.tenant_id IS NOT NULL) DESC NULLS LAST, at.updated_at DESC
      LIMIT 1;
    END IF;
  ELSIF v_form.form_type IN ('weekly_check', 'periodic_check') THEN
    v_check_template_id := v_form.check_template_id;
    v_check_schema := COALESCE(v_form.check_template_snapshot, '{}'::jsonb);
    v_check_title := v_form.check_template_title;
    v_periodicity_days := v_form.check_periodicity_days;
    v_check_ask_progress_photos := COALESCE(v_form.check_ask_progress_photos, false);
    v_check_progress_photo_instructions := v_form.check_progress_photo_instructions;
    v_check_min_progress_photos := v_form.check_min_progress_photos;

    IF (
      v_check_template_id IS NULL OR v_check_title IS NULL OR v_check_schema IS NULL
      OR jsonb_typeof(v_check_schema) != 'object'
    ) THEN
      SELECT ct.id, ct.schema_json, ct.title, ct.periodicity_days,
             ct.ask_progress_photos, ct.progress_photo_instructions, ct.min_progress_photos
      INTO v_check_template_id, v_check_schema, v_check_title, v_periodicity_days,
           v_check_ask_progress_photos, v_check_progress_photo_instructions, v_check_min_progress_photos
      FROM public.check_templates ct
      WHERE ct.tenant_id = v_form.coach_id AND ct.is_active = true
      ORDER BY ct.updated_at DESC
      LIMIT 1;
    END IF;
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
    'anamnesis_template_id', v_anamnesis_template_id,
    'anamnesis_title', v_anamnesis_title,
    'anamnesis_schema_json', v_anamnesis_schema,
    'anamnesis_template_source', v_anamnesis_template_source,
    'check_template_id', v_check_template_id,
    'check_schema_json', v_check_schema,
    'check_title', v_check_title,
    'check_periodicity_days', v_periodicity_days,
    'ask_progress_photos', COALESCE(v_check_ask_progress_photos, false),
    'progress_photo_instructions', v_check_progress_photo_instructions,
    'min_progress_photos', v_check_min_progress_photos
  );
END;
$$;

-- 4) RPC submit_public_form_by_token — ramifica em ambos ------------------------
CREATE OR REPLACE FUNCTION public.submit_public_form_by_token(p_token text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_form record;
  v_template_id uuid;
  v_answers jsonb;
  v_raw_answers jsonb;
  v_legacy_answers jsonb;
  v_consent_lgpd jsonb;
  v_consent_text text;
  v_consented_at timestamptz;
  v_submission_id uuid;
  v_check_template_id uuid;
  v_photo_ids uuid[];
  v_valid_photo_count int;
  v_linked_photo_count int;
begin
  select * into v_form from public.patient_forms where token = p_token limit 1 for update;

  if v_form is null then
    raise exception 'Formulário não encontrado ou token inválido.';
  end if;

  if v_form.status != 'pending' then
    raise exception 'Formulário já foi preenchido ou não está mais pendente.';
  end if;

  if v_form.expires_at < now() then
    update public.patient_forms set status = 'expired' where id = v_form.id;
    raise exception 'O link para este formulário já expirou.';
  end if;

  if v_form.form_type = 'anamnesis' then
    v_template_id := v_form.anamnesis_template_id;

    if v_template_id is null then
      select id into v_template_id
      from public.anamnesis_templates
      where is_active = true and (tenant_id = v_form.coach_id or tenant_id is null)
      order by (tenant_id is not null) desc nulls last, updated_at desc
      limit 1;
    end if;

    if v_template_id is null then
      v_template_id := 'a0000000-0000-4000-8000-000000000001'::uuid;
    end if;

    v_raw_answers := coalesce(p_data->'answers_json', '{}'::jsonb);
    if jsonb_typeof(v_raw_answers) != 'object' then
      v_raw_answers := '{}'::jsonb;
    end if;

    v_legacy_answers := jsonb_strip_nulls(
      jsonb_build_object(
        'submitted_via', 'public_link',
        'resumo_clinico', coalesce(
          nullif(trim(coalesce(v_raw_answers->>'resumo_clinico', '')), ''),
          nullif(trim(
            concat_ws(E'\n',
              nullif(trim(coalesce(v_raw_answers->>'health_conditions', p_data->'data'->>'health_conditions', '')), ''),
              nullif(trim(coalesce(v_raw_answers->>'additional_notes', p_data->'data'->>'additional_notes', '')), '')
            )
          ), '')
        ),
        'restricoes', coalesce(
          nullif(trim(coalesce(v_raw_answers->>'restricoes', '')), ''),
          nullif(trim(coalesce(v_raw_answers->>'allergies', p_data->'data'->>'allergies', '')), '')
        ),
        'medicacoes', coalesce(
          nullif(trim(coalesce(v_raw_answers->>'medicacoes', '')), ''),
          nullif(trim(coalesce(v_raw_answers->>'medications', p_data->'data'->>'medications', '')), '')
        ),
        'goal', coalesce(nullif(trim(coalesce(v_raw_answers->>'goal', '')), ''), nullif(trim(coalesce(p_data->'data'->>'goal', '')), '')),
        'meals_per_day', coalesce(nullif(trim(coalesce(v_raw_answers->>'meals_per_day', '')), ''), nullif(trim(coalesce(p_data->'data'->>'meals_per_day', '')), '')),
        'water_intake', coalesce(nullif(trim(coalesce(v_raw_answers->>'water_intake', '')), ''), nullif(trim(coalesce(p_data->'data'->>'water_intake', '')), '')),
        'training_type', coalesce(nullif(trim(coalesce(v_raw_answers->>'training_type', '')), ''), nullif(trim(coalesce(p_data->'data'->>'training_type', '')), '')),
        'training_frequency', coalesce(nullif(trim(coalesce(v_raw_answers->>'training_frequency', '')), ''), nullif(trim(coalesce(p_data->'data'->>'training_frequency', '')), ''))
      )
    );

    v_answers := v_legacy_answers || v_raw_answers;
    if p_data ? 'consent_lgpd' then
      v_answers := v_answers || jsonb_build_object('consent_lgpd', p_data->'consent_lgpd');
    end if;

    insert into public.anamnesis_submissions (
      tenant_id, student_id, template_id, answers_json, submitted_at, status
    ) values (
      v_form.coach_id, v_form.student_id, v_template_id, v_answers, now(), 'submitted'
    )
    returning id into v_submission_id;

    if p_data ? 'photo_ids' and jsonb_typeof(p_data->'photo_ids') = 'array' and jsonb_array_length(p_data->'photo_ids') > 0 then
      select array(select elem::uuid from jsonb_array_elements_text(p_data->'photo_ids') as elem) into v_photo_ids;

      select count(*) into v_valid_photo_count
      from public.student_progress_photos
      where id = any(v_photo_ids) and student_id = v_form.student_id;

      if v_valid_photo_count != array_length(v_photo_ids, 1) then
        raise exception 'Uma ou mais fotos não pertencem a este aluno ou não foram encontradas.';
      end if;

      select count(*) into v_linked_photo_count
      from public.student_progress_photos
      where id = any(v_photo_ids) and anamnesis_submission_id is not null and anamnesis_submission_id != v_submission_id;

      if v_linked_photo_count > 0 then
        raise exception 'Uma ou mais fotos já estão vinculadas a outra anamnese.';
      end if;

      update public.student_progress_photos
      set anamnesis_submission_id = v_submission_id
      where id = any(v_photo_ids) and student_id = v_form.student_id
        and (anamnesis_submission_id is null or anamnesis_submission_id = v_submission_id);

      get diagnostics v_linked_photo_count = row_count;

      if v_linked_photo_count != array_length(v_photo_ids, 1) then
        raise warning 'Apenas % de % fotos foram vinculadas à anamnese.', v_linked_photo_count, array_length(v_photo_ids, 1);
      end if;
    end if;

    if p_data ? 'consent_lgpd' then
      v_consent_lgpd := p_data->'consent_lgpd';
      v_consent_text := coalesce(v_consent_lgpd->>'consent_text', 'Autorizo o compartilhamento dos dados de saúde com o profissional para fins de acompanhamento.');
      v_consented_at := coalesce((v_consent_lgpd->>'consented_at')::timestamptz, now());

      insert into public.data_consents (form_id, student_id, tenant_id, consent_type, consent_version, consent_text, consented_at, metadata)
      values (
        v_form.id, v_form.student_id, v_form.coach_id, 'anamnesis_public_lgpd', '1.0', v_consent_text, v_consented_at,
        jsonb_build_object('form_type', v_form.form_type, 'anamnesis_template_id', v_template_id)
      )
      on conflict do nothing;

      insert into public.consent_records (user_id, consent_type, consent_version, accepted, accepted_at, consent_text)
      values (v_form.student_id, 'health_data_sharing', '1.0', true, v_consented_at, v_consent_text)
      on conflict do nothing;

      update public.user_health_context
      set health_consent_given_at = v_consented_at, health_consent_version = '1.0', updated_at = now()
      where user_id = v_form.student_id and tenant_id = v_form.coach_id
        and (health_consent_given_at is null or health_consent_given_at < v_consented_at);
    end if;

  elsif v_form.form_type in ('weekly_check', 'periodic_check') then
    select id into v_check_template_id
    from public.check_templates
    where tenant_id = v_form.coach_id and is_active = true
    order by updated_at desc
    limit 1;

    if v_check_template_id is null then
      raise exception 'Nenhum template de check ativo para este profissional.';
    end if;

    v_answers := coalesce(p_data->'answers_json', '{}');
    if jsonb_typeof(v_answers) != 'object' then
      v_answers := '{}';
    end if;

    insert into public.check_submissions (
      tenant_id, student_id, patient_form_id, template_id, answers_json, submitted_at, status
    ) values (
      v_form.coach_id, v_form.student_id, v_form.id, v_check_template_id, v_answers, now(), 'submitted'
    )
    on conflict (patient_form_id)
    do update set
      tenant_id = excluded.tenant_id,
      student_id = excluded.student_id,
      template_id = excluded.template_id,
      answers_json = excluded.answers_json,
      submitted_at = excluded.submitted_at,
      status = excluded.status,
      updated_at = now()
    returning id into v_submission_id;

    if p_data ? 'photo_ids' and jsonb_typeof(p_data->'photo_ids') = 'array' and jsonb_array_length(p_data->'photo_ids') > 0 then
      select array(select elem::uuid from jsonb_array_elements_text(p_data->'photo_ids') as elem) into v_photo_ids;

      select count(*) into v_valid_photo_count
      from public.student_progress_photos
      where id = any(v_photo_ids) and student_id = v_form.student_id;

      if v_valid_photo_count != array_length(v_photo_ids, 1) then
        raise exception 'Uma ou mais fotos não pertencem a este aluno ou não foram encontradas.';
      end if;

      select count(*) into v_linked_photo_count
      from public.student_progress_photos
      where id = any(v_photo_ids) and check_submission_id is not null and check_submission_id != v_submission_id;

      if v_linked_photo_count > 0 then
        raise exception 'Uma ou mais fotos já estão vinculadas a outro check.';
      end if;

      update public.student_progress_photos
      set check_submission_id = v_submission_id
      where id = any(v_photo_ids) and student_id = v_form.student_id
        and (check_submission_id is null or check_submission_id = v_submission_id);

      get diagnostics v_linked_photo_count = row_count;

      if v_linked_photo_count != array_length(v_photo_ids, 1) then
        raise warning 'Apenas % de % fotos foram vinculadas ao check.', v_linked_photo_count, array_length(v_photo_ids, 1);
      end if;
    end if;
  else
    raise exception 'Tipo de formulário não suportado: %', v_form.form_type;
  end if;

  update public.patient_forms
  set status = 'completed', submitted_data = p_data, submitted_at = now()
  where id = v_form.id;
end;
$$;

COMMENT ON FUNCTION public.submit_public_form_by_token(text, jsonb) IS 'Submete formulário público (anamnese ou periodic_check) com lock por token e idempotência para checks.';

-- 5) Canonicaliza linhas históricas weekly_check -> periodic_check --------------
UPDATE public.patient_forms SET form_type = 'periodic_check' WHERE form_type = 'weekly_check';

-- 6) View diagnóstica: rótulo derivado passa a 'periodic_check' -----------------
CREATE OR REPLACE VIEW public.v_orphaned_public_form_photos AS
 SELECT id, student_id, created_at, angle, notes,
        CASE
            WHEN (notes ~~ '%anamnesis%'::text) THEN 'anamnesis'::text
            WHEN (notes ~~ '%weekly check%'::text) THEN 'periodic_check'::text
            ELSE 'unknown'::text
        END AS likely_form_type,
    (EXTRACT(epoch FROM (now() - created_at)) / (86400)::numeric) AS days_old
   FROM public.student_progress_photos spp
  WHERE ((anamnesis_submission_id IS NULL) AND (check_submission_id IS NULL)
    AND ((notes ~~ '%public%form%'::text) OR (notes ~~ '%Uploaded via%'::text))
    AND (created_at >= '2024-04-22 00:00:00+00'::timestamp with time zone))
  ORDER BY created_at DESC;

NOTIFY pgrst, 'reload schema';
