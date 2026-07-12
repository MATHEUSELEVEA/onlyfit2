-- Periodic Check delivery rules.
-- Precedence used by ensure_weekly_check_forms_for_student:
-- student > product > operation_offer > operation_cohort > organization > latest active coach template.

CREATE TABLE IF NOT EXISTS public.check_delivery_rules ( -- ENABLE ROW LEVEL SECURITY below
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('student','product','operation_offer','operation_cohort','organization')),
  source_id uuid,
  check_template_id uuid REFERENCES public.check_templates(id) ON DELETE SET NULL,
  periodicity_days integer CHECK (periodicity_days IS NULL OR periodicity_days BETWEEN 1 AND 365),
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_delivery_rules_source_required_chk
    CHECK (
      (source_type = 'organization' AND source_id IS NULL)
      OR (source_type <> 'organization' AND source_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS check_delivery_rules_unique_idx
  ON public.check_delivery_rules (
    coach_id,
    source_type,
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE UNIQUE INDEX IF NOT EXISTS check_delivery_rules_unique_plain_idx
  ON public.check_delivery_rules (coach_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS check_delivery_rules_org_idx
  ON public.check_delivery_rules (organization_id, source_type, source_id)
  WHERE organization_id IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS check_delivery_rules_coach_source_idx
  ON public.check_delivery_rules (coach_id, source_type, source_id)
  WHERE is_active = true;

ALTER TABLE public.check_delivery_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS check_delivery_rules_select_staff ON public.check_delivery_rules;
CREATE POLICY check_delivery_rules_select_staff
  ON public.check_delivery_rules FOR SELECT
  TO authenticated
  USING (
    coach_id = (select auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.is_organization_staff(organization_id, (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS check_delivery_rules_insert_staff ON public.check_delivery_rules;
CREATE POLICY check_delivery_rules_insert_staff
  ON public.check_delivery_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    coach_id = (select auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.is_organization_admin(organization_id, (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS check_delivery_rules_update_staff ON public.check_delivery_rules;
CREATE POLICY check_delivery_rules_update_staff
  ON public.check_delivery_rules FOR UPDATE
  TO authenticated
  USING (
    coach_id = (select auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.is_organization_admin(organization_id, (select auth.uid()))
    )
  )
  WITH CHECK (
    coach_id = (select auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.is_organization_admin(organization_id, (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS check_delivery_rules_delete_staff ON public.check_delivery_rules;
CREATE POLICY check_delivery_rules_delete_staff
  ON public.check_delivery_rules FOR DELETE
  TO authenticated
  USING (
    coach_id = (select auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.is_organization_admin(organization_id, (select auth.uid()))
    )
  );

DROP TRIGGER IF EXISTS check_delivery_rules_set_updated_at ON public.check_delivery_rules;
CREATE TRIGGER check_delivery_rules_set_updated_at
  BEFORE UPDATE ON public.check_delivery_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON TABLE public.check_delivery_rules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.check_delivery_rules TO authenticated;
GRANT ALL ON TABLE public.check_delivery_rules TO service_role;

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
    WITH active_relationships AS (
      SELECT cr.coach_id, cr.organization_id
      FROM public.coach_relationships cr
      WHERE cr.student_id = p_student_id
        AND cr.coach_id = v_coach_id
        AND cr.status = 'active'
    ),
    active_products AS (
      SELECT
        ar.coach_id,
        ar.organization_id,
        p.id AS product_id,
        p.source_id AS operation_offer_id
      FROM active_relationships ar
      JOIN public.product_purchases pp
        ON pp.buyer_id = p_student_id
       AND (pp.expires_at IS NULL OR pp.expires_at > now())
      JOIN public.products p
        ON p.id = pp.product_id
       AND COALESCE(p.creator_id, p.tenant_id) = ar.coach_id
       AND COALESCE(p.active, true) = true
    ),
    ranked_rules AS (
      SELECT ar.coach_id, ar.organization_id, r.check_template_id, r.periodicity_days, 10 AS rule_rank
      FROM active_relationships ar
      JOIN public.check_delivery_rules r
        ON r.coach_id = ar.coach_id
       AND r.source_type = 'student'
       AND r.source_id = p_student_id
       AND r.is_active = true

      UNION ALL
      SELECT ap.coach_id, COALESCE(ap.organization_id, r.organization_id), r.check_template_id, r.periodicity_days, 20 AS rule_rank
      FROM active_products ap
      JOIN public.check_delivery_rules r
        ON r.coach_id = ap.coach_id
       AND r.source_type = 'product'
       AND r.source_id = ap.product_id
       AND r.is_active = true

      UNION ALL
      SELECT ap.coach_id, COALESCE(ap.organization_id, r.organization_id), r.check_template_id, r.periodicity_days, 30 AS rule_rank
      FROM active_products ap
      JOIN public.check_delivery_rules r
        ON r.coach_id = ap.coach_id
       AND r.source_type = 'operation_offer'
       AND r.source_id = ap.operation_offer_id
       AND r.is_active = true

      UNION ALL
      SELECT ar.coach_id, ar.organization_id, r.check_template_id, r.periodicity_days, 40 AS rule_rank
      FROM active_relationships ar
      JOIN public.check_delivery_rules r
        ON r.coach_id = ar.coach_id
       AND r.source_type = 'organization'
       AND r.source_id IS NULL
       AND r.organization_id = ar.organization_id
       AND r.is_active = true

      UNION ALL
      SELECT ar.coach_id, ar.organization_id, NULL::uuid, NULL::integer, 99 AS rule_rank
      FROM active_relationships ar
    )
    SELECT
      ct.id,
      ct.schema_json,
      ct.title,
      GREATEST(COALESCE(rr.periodicity_days, ct.periodicity_days, 7), 1),
      COALESCE(ct.ask_progress_photos, false),
      ct.progress_photo_instructions,
      ct.min_progress_photos
    INTO
      v_check_template_id,
      v_check_schema,
      v_check_title,
      v_check_periodicity_days,
      v_check_ask_progress_photos,
      v_check_progress_photo_instructions,
      v_check_min_progress_photos
    FROM ranked_rules rr
    JOIN LATERAL (
      SELECT *
      FROM public.check_templates ct
      WHERE ct.tenant_id = rr.coach_id
        AND ct.is_active = true
        AND (rr.check_template_id IS NULL OR ct.id = rr.check_template_id)
      ORDER BY
        CASE WHEN rr.check_template_id IS NOT NULL AND ct.id = rr.check_template_id THEN 0 ELSE 1 END,
        ct.updated_at DESC
      LIMIT 1
    ) ct ON true
    ORDER BY rr.rule_rank, ct.updated_at DESC
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
IS 'Cria link público de formulário. Checks manuais usam regras por aluno/produto/oferta/organização antes do modelo padrão.';

CREATE OR REPLACE FUNCTION public.ensure_weekly_check_forms_for_student(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  student_id uuid,
  coach_id uuid,
  form_type text,
  status text,
  token text,
  expires_at timestamptz,
  created_at timestamptz,
  check_template_id uuid,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_student_id uuid := COALESCE(p_student_id, auth.uid());
  v_rel record;
  v_pending public.patient_forms%rowtype;
  v_inserted public.patient_forms%rowtype;
  v_recent_cutoff timestamptz;
BEGIN
  IF v_actor IS NULL OR v_student_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado.';
  END IF;

  IF v_actor IS DISTINCT FROM v_student_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.coach_relationships cr
       WHERE cr.student_id = v_student_id
         AND cr.coach_id = v_actor
         AND cr.status = 'active'
     ) THEN
    RAISE EXCEPTION 'Sem permissão para gerar check deste aluno.';
  END IF;

  FOR v_rel IN
    WITH active_relationships AS (
      SELECT cr.coach_id, cr.organization_id
      FROM public.coach_relationships cr
      WHERE cr.student_id = v_student_id
        AND cr.status = 'active'
        AND cr.coach_id IS NOT NULL
    ),
    active_products AS (
      SELECT
        ar.coach_id,
        ar.organization_id,
        p.id AS product_id,
        p.source_id AS operation_offer_id
      FROM active_relationships ar
      JOIN public.product_purchases pp
        ON pp.buyer_id = v_student_id
       AND (pp.expires_at IS NULL OR pp.expires_at > now())
      JOIN public.products p
        ON p.id = pp.product_id
       AND COALESCE(p.creator_id, p.tenant_id) = ar.coach_id
       AND COALESCE(p.active, true) = true
    ),
    ranked_rules AS (
      SELECT ar.coach_id, ar.organization_id, r.check_template_id, r.periodicity_days, 10 AS rule_rank
      FROM active_relationships ar
      JOIN public.check_delivery_rules r
        ON r.coach_id = ar.coach_id
       AND r.source_type = 'student'
       AND r.source_id = v_student_id
       AND r.is_active = true

      UNION ALL
      SELECT ap.coach_id, COALESCE(ap.organization_id, r.organization_id), r.check_template_id, r.periodicity_days, 20 AS rule_rank
      FROM active_products ap
      JOIN public.check_delivery_rules r
        ON r.coach_id = ap.coach_id
       AND r.source_type = 'product'
       AND r.source_id = ap.product_id
       AND r.is_active = true

      UNION ALL
      SELECT ap.coach_id, COALESCE(ap.organization_id, r.organization_id), r.check_template_id, r.periodicity_days, 30 AS rule_rank
      FROM active_products ap
      JOIN public.check_delivery_rules r
        ON r.coach_id = ap.coach_id
       AND r.source_type = 'operation_offer'
       AND r.source_id = ap.operation_offer_id
       AND r.is_active = true

      UNION ALL
      SELECT ar.coach_id, ar.organization_id, r.check_template_id, r.periodicity_days, 40 AS rule_rank
      FROM active_relationships ar
      JOIN public.check_delivery_rules r
        ON r.coach_id = ar.coach_id
       AND r.source_type = 'organization'
       AND r.source_id IS NULL
       AND r.organization_id = ar.organization_id
       AND r.is_active = true

      UNION ALL
      SELECT ar.coach_id, ar.organization_id, NULL::uuid, NULL::integer, 99 AS rule_rank
      FROM active_relationships ar
    ),
    resolved AS (
      SELECT DISTINCT ON (rr.coach_id)
        rr.coach_id,
        rr.organization_id,
        ct.id AS template_id,
        ct.schema_json,
        ct.title,
        GREATEST(COALESCE(rr.periodicity_days, ct.periodicity_days, 7), 1) AS periodicity_days,
        COALESCE(ct.ask_progress_photos, false) AS ask_progress_photos,
        ct.progress_photo_instructions,
        ct.min_progress_photos,
        rr.rule_rank
      FROM ranked_rules rr
      JOIN LATERAL (
        SELECT *
        FROM public.check_templates ct
        WHERE ct.tenant_id = rr.coach_id
          AND ct.is_active = true
          AND (rr.check_template_id IS NULL OR ct.id = rr.check_template_id)
        ORDER BY
          CASE WHEN rr.check_template_id IS NOT NULL AND ct.id = rr.check_template_id THEN 0 ELSE 1 END,
          ct.updated_at DESC
        LIMIT 1
      ) ct ON true
      ORDER BY rr.coach_id, rr.rule_rank, ct.updated_at DESC
    )
    SELECT * FROM resolved
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_student_id::text || ':' || v_rel.coach_id::text || ':' || v_rel.template_id::text,
        0
      )
    );

    SELECT pf.*
      INTO v_pending
    FROM public.patient_forms pf
    WHERE pf.student_id = v_student_id
      AND pf.coach_id = v_rel.coach_id
      AND pf.form_type IN ('weekly_check', 'periodic_check', 'check')
      AND pf.status = 'pending'
      AND pf.expires_at > now()
    ORDER BY pf.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      id := v_pending.id;
      student_id := v_pending.student_id;
      coach_id := v_pending.coach_id;
      form_type := v_pending.form_type;
      status := v_pending.status;
      token := v_pending.token;
      expires_at := v_pending.expires_at;
      created_at := v_pending.created_at;
      check_template_id := v_pending.check_template_id;
      created := false;
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_recent_cutoff := now() - (v_rel.periodicity_days || ' days')::interval;

    IF EXISTS (
      SELECT 1
      FROM public.check_submissions cs
      WHERE cs.student_id = v_student_id
        AND cs.tenant_id = v_rel.coach_id
        AND cs.template_id = v_rel.template_id
        AND cs.submitted_at >= v_recent_cutoff
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.patient_forms (
      student_id,
      coach_id,
      form_type,
      token,
      status,
      expires_at,
      check_template_id,
      check_template_snapshot,
      check_template_title,
      check_periodicity_days,
      check_ask_progress_photos,
      check_progress_photo_instructions,
      check_min_progress_photos
    )
    VALUES (
      v_student_id,
      v_rel.coach_id,
      'periodic_check',
      encode(extensions.gen_random_bytes(16), 'hex'),
      'pending',
      now() + (v_rel.periodicity_days || ' days')::interval,
      v_rel.template_id,
      v_rel.schema_json,
      v_rel.title,
      v_rel.periodicity_days,
      v_rel.ask_progress_photos,
      v_rel.progress_photo_instructions,
      v_rel.min_progress_photos
    )
    RETURNING *
    INTO v_inserted;

    id := v_inserted.id;
    student_id := v_inserted.student_id;
    coach_id := v_inserted.coach_id;
    form_type := v_inserted.form_type;
    status := v_inserted.status;
    token := v_inserted.token;
    expires_at := v_inserted.expires_at;
    created_at := v_inserted.created_at;
    check_template_id := v_inserted.check_template_id;
    created := true;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_weekly_check_forms_for_student(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_weekly_check_forms_for_student(uuid) TO authenticated;

COMMENT ON TABLE public.check_delivery_rules IS
  'Configura periodicidade/modelo de Check por aluno, produto/plano, oferta/turma ou organização. O modelo global do coach permanece como fallback.';
