-- Operational anamnesis routing.
-- Lets the product choose which initial anamnesis is sent by student, plan/product,
-- offer/cohort or organization without renaming existing public form tables.

CREATE TABLE IF NOT EXISTS public.anamnesis_delivery_rules ( -- ENABLE ROW LEVEL SECURITY below
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('student','product','operation_offer','operation_cohort','organization')),
  source_id uuid,
  anamnesis_template_id uuid REFERENCES public.anamnesis_templates(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anamnesis_delivery_rules_source_required_chk
    CHECK (
      (source_type = 'organization' AND source_id IS NULL)
      OR (source_type <> 'organization' AND source_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS anamnesis_delivery_rules_unique_idx
  ON public.anamnesis_delivery_rules (
    coach_id,
    source_type,
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE UNIQUE INDEX IF NOT EXISTS anamnesis_delivery_rules_unique_plain_idx
  ON public.anamnesis_delivery_rules (coach_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS anamnesis_delivery_rules_org_idx
  ON public.anamnesis_delivery_rules (organization_id, source_type, source_id)
  WHERE organization_id IS NOT NULL AND is_active = true;

ALTER TABLE public.anamnesis_delivery_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anamnesis_delivery_rules_select_staff ON public.anamnesis_delivery_rules;
CREATE POLICY anamnesis_delivery_rules_select_staff
  ON public.anamnesis_delivery_rules FOR SELECT
  TO authenticated
  USING (
    coach_id = (select auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.is_organization_staff(organization_id, (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS anamnesis_delivery_rules_insert_staff ON public.anamnesis_delivery_rules;
CREATE POLICY anamnesis_delivery_rules_insert_staff
  ON public.anamnesis_delivery_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    coach_id = (select auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.is_organization_admin(organization_id, (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS anamnesis_delivery_rules_update_staff ON public.anamnesis_delivery_rules;
CREATE POLICY anamnesis_delivery_rules_update_staff
  ON public.anamnesis_delivery_rules FOR UPDATE
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

DROP POLICY IF EXISTS anamnesis_delivery_rules_delete_staff ON public.anamnesis_delivery_rules;
CREATE POLICY anamnesis_delivery_rules_delete_staff
  ON public.anamnesis_delivery_rules FOR DELETE
  TO authenticated
  USING (
    coach_id = (select auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.is_organization_admin(organization_id, (select auth.uid()))
    )
  );

DROP TRIGGER IF EXISTS anamnesis_delivery_rules_set_updated_at ON public.anamnesis_delivery_rules;
CREATE TRIGGER anamnesis_delivery_rules_set_updated_at
  BEFORE UPDATE ON public.anamnesis_delivery_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON TABLE public.anamnesis_delivery_rules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.anamnesis_delivery_rules TO authenticated;
GRANT ALL ON TABLE public.anamnesis_delivery_rules TO service_role;

CREATE OR REPLACE FUNCTION public.create_patient_form(
  p_student_id UUID,
  p_form_type TEXT,
  p_expires_in_days INTEGER DEFAULT 7
)
RETURNS JSONB
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
      SELECT ar.coach_id, ar.organization_id, r.anamnesis_template_id, 10 AS rule_rank
      FROM active_relationships ar
      JOIN public.anamnesis_delivery_rules r
        ON r.coach_id = ar.coach_id
       AND r.source_type = 'student'
       AND r.source_id = p_student_id
       AND r.is_active = true

      UNION ALL
      SELECT ap.coach_id, COALESCE(ap.organization_id, r.organization_id), r.anamnesis_template_id, 20 AS rule_rank
      FROM active_products ap
      JOIN public.anamnesis_delivery_rules r
        ON r.coach_id = ap.coach_id
       AND r.source_type = 'product'
       AND r.source_id = ap.product_id
       AND r.is_active = true

      UNION ALL
      SELECT ap.coach_id, COALESCE(ap.organization_id, r.organization_id), r.anamnesis_template_id, 30 AS rule_rank
      FROM active_products ap
      JOIN public.anamnesis_delivery_rules r
        ON r.coach_id = ap.coach_id
       AND r.source_type = 'operation_offer'
       AND r.source_id = ap.operation_offer_id
       AND r.is_active = true

      UNION ALL
      SELECT ar.coach_id, ar.organization_id, r.anamnesis_template_id, 40 AS rule_rank
      FROM active_relationships ar
      JOIN public.anamnesis_delivery_rules r
        ON r.coach_id = ar.coach_id
       AND r.source_type = 'organization'
       AND r.source_id IS NULL
       AND r.organization_id = ar.organization_id
       AND r.is_active = true

      UNION ALL
      SELECT ar.coach_id, ar.organization_id, NULL::uuid, 99 AS rule_rank
      FROM active_relationships ar
    )
    SELECT at.id
    INTO v_anamnesis_template_id
    FROM ranked_rules rr
    JOIN LATERAL (
      SELECT *
      FROM public.anamnesis_templates at
      WHERE at.is_active = true
        AND (at.tenant_id = rr.coach_id OR at.tenant_id IS NULL)
        AND (rr.anamnesis_template_id IS NULL OR at.id = rr.anamnesis_template_id)
      ORDER BY
        CASE WHEN rr.anamnesis_template_id IS NOT NULL AND at.id = rr.anamnesis_template_id THEN 0 ELSE 1 END,
        (at.tenant_id IS NOT NULL) DESC,
        at.updated_at DESC
      LIMIT 1
    ) at ON true
    ORDER BY rr.rule_rank, (at.tenant_id IS NOT NULL) DESC, at.updated_at DESC
    LIMIT 1;

    IF v_anamnesis_template_id IS NULL THEN
      RAISE EXCEPTION 'Nenhum modelo de anamnese ativo para este profissional.';
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

COMMENT ON TABLE public.anamnesis_delivery_rules IS
  'Configura qual modelo de anamnese inicial usar por aluno, produto/plano, oferta/turma ou organização. Links antigos continuam usando patient_forms.';

COMMENT ON FUNCTION public.create_patient_form(uuid, text, integer)
IS 'Cria link público de formulário. Anamnese e Check resolvem regras por aluno/produto/oferta/organização antes do modelo padrão do profissional.';
