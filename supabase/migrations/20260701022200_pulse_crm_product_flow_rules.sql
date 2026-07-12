-- CRM operacional por produto/plano/turma.
-- Fase P0: templates oficiais, regras por fonte e RPC de enfileiramento.

ALTER TABLE public.pulse_action_outbox
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pulse_action_outbox_organization_status_idx
  ON public.pulse_action_outbox (organization_id, status, created_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.product_crm_flow_rules ( -- ENABLE ROW LEVEL SECURITY below
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('product','operation_offer','operation_cohort','organization')),
  source_id uuid,
  event_type text NOT NULL,
  trigger_type text NOT NULL REFERENCES public.pulse_flow_template_system(trigger_type) ON UPDATE CASCADE ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_crm_flow_rules_source_required_chk
    CHECK (
      (source_type = 'organization' AND source_id IS NULL)
      OR (source_type <> 'organization' AND source_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS product_crm_flow_rules_unique_idx
  ON public.product_crm_flow_rules (
    organization_id,
    source_type,
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid),
    event_type,
    trigger_type
  );

CREATE UNIQUE INDEX IF NOT EXISTS product_crm_flow_rules_unique_plain_idx
  ON public.product_crm_flow_rules (organization_id, source_type, source_id, event_type, trigger_type);

CREATE INDEX IF NOT EXISTS product_crm_flow_rules_source_event_idx
  ON public.product_crm_flow_rules (organization_id, source_type, source_id, event_type)
  WHERE is_active = true;

ALTER TABLE public.product_crm_flow_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_crm_flow_rules_select_staff ON public.product_crm_flow_rules;
CREATE POLICY product_crm_flow_rules_select_staff
  ON public.product_crm_flow_rules FOR SELECT
  TO authenticated
  USING (private.is_organization_staff(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS product_crm_flow_rules_insert_admin ON public.product_crm_flow_rules;
CREATE POLICY product_crm_flow_rules_insert_admin
  ON public.product_crm_flow_rules FOR INSERT
  TO authenticated
  WITH CHECK (private.is_organization_admin(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS product_crm_flow_rules_update_admin ON public.product_crm_flow_rules;
CREATE POLICY product_crm_flow_rules_update_admin
  ON public.product_crm_flow_rules FOR UPDATE
  TO authenticated
  USING (private.is_organization_admin(organization_id, (select auth.uid())))
  WITH CHECK (private.is_organization_admin(organization_id, (select auth.uid())));

DROP POLICY IF EXISTS product_crm_flow_rules_delete_admin ON public.product_crm_flow_rules;
CREATE POLICY product_crm_flow_rules_delete_admin
  ON public.product_crm_flow_rules FOR DELETE
  TO authenticated
  USING (private.is_organization_admin(organization_id, (select auth.uid())));

DROP TRIGGER IF EXISTS product_crm_flow_rules_set_updated_at ON public.product_crm_flow_rules;
CREATE TRIGGER product_crm_flow_rules_set_updated_at
  BEFORE UPDATE ON public.product_crm_flow_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON TABLE public.product_crm_flow_rules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_crm_flow_rules TO authenticated;
GRANT ALL ON TABLE public.product_crm_flow_rules TO service_role;

INSERT INTO public.pulse_flow_template_system (
  trigger_type,
  body_template,
  intent,
  tone_level,
  priority,
  audience,
  channel,
  template_version,
  max_body_lines
) VALUES
(
  'ONBOARDING_WELCOME',
  E'Olá, {{primeiro_nome}}. Bem-vindo(a) ao {{nome_produto}}.\n\nA partir de agora seu acompanhamento acontece pelo OnlyFit. Abra o app para ver seus próximos passos:\n{{link_app}}',
  'welcome', 'normal', 'normal', 'STUDENT', 'WHATSAPP', 1, 10
),
(
  'ONBOARDING_WELCOME_WITH_ANAMNESIS',
  E'Olá, {{primeiro_nome}}. Bem-vindo(a) ao {{nome_produto}}.\n\nPara começarmos com segurança, preencha a {{nome_formulario}}:\n{{link_formulario}}\n\nDepois disso, seguimos com seus próximos passos.',
  'welcome', 'normal', 'high', 'STUDENT', 'WHATSAPP', 1, 12
),
(
  'ANAMNESIS_REQUESTED',
  E'Olá, {{primeiro_nome}}. Preciso que você preencha a {{nome_formulario}} para ajustarmos seu acompanhamento.\n\nLink: {{link_formulario}}',
  'welcome', 'normal', 'high', 'STUDENT', 'WHATSAPP', 1, 10
),
(
  'ANAMNESIS_PENDING_REMINDER',
  E'Olá, {{primeiro_nome}}. A {{nome_formulario}} ainda está pendente.\n\nQuando puder, preencha por aqui:\n{{link_formulario}}',
  'retention', 'light', 'normal', 'STUDENT', 'WHATSAPP', 1, 10
),
(
  'CHECK_REQUESTED',
  E'Olá, {{primeiro_nome}}. Seu check está disponível.\n\nPreencha por aqui para eu acompanhar sua evolução:\n{{link_formulario}}',
  'retention', 'normal', 'normal', 'STUDENT', 'WHATSAPP', 1, 10
),
(
  'CHECK_PENDING_REMINDER',
  E'Olá, {{primeiro_nome}}. Seu check ainda está pendente.\n\nResponda quando puder:\n{{link_formulario}}',
  'retention', 'light', 'normal', 'STUDENT', 'WHATSAPP', 1, 10
),
(
  'PRODUCT_ACCESS_GRANTED',
  E'Olá, {{primeiro_nome}}. Seu acesso ao {{nome_produto}} foi liberado.\n\nAbra o app para começar:\n{{link_app}}',
  'welcome', 'normal', 'normal', 'STUDENT', 'WHATSAPP', 1, 8
),
(
  'SUBSCRIPTION_ACTIVATED',
  E'Olá, {{primeiro_nome}}. Seu plano {{nome_plano}} está ativo.\n\nVamos seguir pelo OnlyFit para manter tudo organizado.',
  'welcome', 'normal', 'normal', 'STUDENT', 'WHATSAPP', 1, 8
),
(
  'COHORT_JOINED',
  E'Olá, {{primeiro_nome}}. Você entrou na turma {{nome_turma}}.\n\nModalidade: {{modalidade}}\nInício: {{data_inicio_turma}}',
  'welcome', 'normal', 'normal', 'STUDENT', 'WHATSAPP', 1, 10
),
(
  'COHORT_STARTING',
  E'Olá, {{primeiro_nome}}. A turma {{nome_turma}} começa em breve.\n\nLocal: {{local_treino}}\nHorário: {{horario_treino}}',
  'alert', 'normal', 'normal', 'STUDENT', 'WHATSAPP', 1, 10
)
ON CONFLICT (trigger_type) DO UPDATE SET
  body_template = EXCLUDED.body_template,
  intent = EXCLUDED.intent,
  tone_level = EXCLUDED.tone_level,
  priority = EXCLUDED.priority,
  audience = EXCLUDED.audience,
  channel = EXCLUDED.channel,
  template_version = GREATEST(public.pulse_flow_template_system.template_version, EXCLUDED.template_version),
  max_body_lines = EXCLUDED.max_body_lines,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.enqueue_crm_flows_for_event(
  p_organization_id uuid,
  p_coach_id uuid,
  p_student_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_event_type text,
  p_context_data jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(outbox_id uuid, trigger_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rule record;
  v_context jsonb := COALESCE(p_context_data, '{}'::jsonb);
  v_inserted uuid;
BEGIN
  IF p_organization_id IS NULL OR p_coach_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'missing_required_context';
  END IF;

  IF p_source_type NOT IN ('product','operation_offer','operation_cohort','organization') THEN
    RAISE EXCEPTION 'invalid_source_type';
  END IF;

  IF p_source_type <> 'organization' AND p_source_id IS NULL THEN
    RAISE EXCEPTION 'source_id_required';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT private.is_organization_staff(p_organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_rule IN
    SELECT *
    FROM (
      SELECT r.*, 0 AS rule_rank
      FROM public.product_crm_flow_rules r
      WHERE r.organization_id = p_organization_id
        AND r.is_active = true
        AND r.event_type = p_event_type
        AND r.source_type = p_source_type
        AND r.source_id IS NOT DISTINCT FROM p_source_id
      UNION ALL
      SELECT r.*, 1 AS rule_rank
      FROM public.product_crm_flow_rules r
      WHERE r.organization_id = p_organization_id
        AND r.is_active = true
        AND r.event_type = p_event_type
        AND r.source_type = 'organization'
        AND r.source_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.product_crm_flow_rules specific
          WHERE specific.organization_id = p_organization_id
            AND specific.is_active = true
            AND specific.event_type = p_event_type
            AND specific.source_type = p_source_type
            AND specific.source_id IS NOT DISTINCT FROM p_source_id
        )
    ) rules
    ORDER BY rule_rank, created_at
  LOOP
    IF NOT public.pulse_flow_delivery_allowed(p_coach_id, v_rule.trigger_type, p_student_id) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.pulse_action_outbox (
      organization_id,
      student_id,
      coach_id,
      channel,
      trigger_type,
      context_data,
      status,
      message_priority
    )
    VALUES (
      p_organization_id,
      p_student_id,
      p_coach_id,
      'WHATSAPP',
      v_rule.trigger_type,
      v_context
        || jsonb_build_object(
          'source_type', p_source_type,
          'source_id', p_source_id,
          'event_type', p_event_type,
          'crm_flow_rule_id', v_rule.id
        )
        || COALESCE(v_rule.metadata, '{}'::jsonb),
      'PENDING',
      COALESCE(NULLIF(v_rule.metadata ->> 'message_priority', ''), 'normal')
    )
    RETURNING id INTO v_inserted;

    outbox_id := v_inserted;
    trigger_type := v_rule.trigger_type;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_crm_flows_for_event(uuid, uuid, uuid, text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_crm_flows_for_event(uuid, uuid, uuid, text, uuid, text, jsonb)
  TO authenticated, service_role;

COMMENT ON TABLE public.product_crm_flow_rules IS
  'Links products, operation offers, cohorts or organization defaults to CRM trigger templates.';

COMMENT ON FUNCTION public.enqueue_crm_flows_for_event(uuid, uuid, uuid, text, uuid, text, jsonb) IS
  'Queues CRM actions for a product/offer/cohort event using organization-scoped rules. Does not expose health-sensitive data.';
