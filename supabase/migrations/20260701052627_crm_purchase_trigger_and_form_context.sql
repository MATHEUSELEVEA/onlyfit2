-- CRM flows must be driven by the canonical purchase grant, not by payment
-- gateway webhooks. Any gateway/fallback that creates product_purchases now
-- gets the same automation surface.

CREATE OR REPLACE FUNCTION public.create_patient_form_for_crm(
  p_coach_id uuid,
  p_student_id uuid,
  p_form_type text,
  p_expires_in_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_previous_sub text;
  v_result jsonb;
BEGIN
  IF p_coach_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'missing_required_context';
  END IF;

  -- create_patient_form already owns the full model-resolution hierarchy
  -- (student > product > offer/cohort > organization > coach default). For
  -- system-triggered CRM events we run it as the professional explicitly.
  v_previous_sub := current_setting('request.jwt.claim.sub', true);
  PERFORM set_config('request.jwt.claim.sub', p_coach_id::text, true);

  v_result := public.create_patient_form(p_student_id, p_form_type, p_expires_in_days);

  IF v_previous_sub IS NOT NULL AND v_previous_sub <> '' THEN
    PERFORM set_config('request.jwt.claim.sub', v_previous_sub, true);
  END IF;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    IF v_previous_sub IS NOT NULL AND v_previous_sub <> '' THEN
      PERFORM set_config('request.jwt.claim.sub', v_previous_sub, true);
    END IF;
    RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_patient_form_for_crm(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_form_for_crm(uuid, uuid, text, integer)
  TO service_role;

COMMENT ON FUNCTION public.create_patient_form_for_crm(uuid, uuid, text, integer) IS
  'Creates a public anamnesis/check link for CRM system events using the same delivery-rule hierarchy as create_patient_form.';

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
  v_rule_context jsonb;
  v_form jsonb;
  v_form_type text;
  v_form_name text;
  v_form_days integer;
  v_form_url text;
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

    v_rule_context :=
      v_context
      || jsonb_build_object(
        'source_type', p_source_type,
        'source_id', p_source_id,
        'event_type', p_event_type,
        'crm_flow_rule_id', v_rule.id
      )
      || COALESCE(v_rule.metadata, '{}'::jsonb);

    v_form_type := CASE
      WHEN v_rule.trigger_type IN ('ONBOARDING_WELCOME_WITH_ANAMNESIS', 'ANAMNESIS_REQUESTED') THEN 'anamnesis'
      WHEN v_rule.trigger_type = 'CHECK_REQUESTED' THEN 'check'
      ELSE NULL
    END;

    IF v_form_type IS NOT NULL THEN
      v_form_name := CASE WHEN v_form_type = 'anamnesis' THEN 'Anamnese inicial' ELSE 'Check periódico' END;
      v_form_days := GREATEST(COALESCE(NULLIF(v_rule.metadata ->> 'form_expires_in_days', '')::integer, 7), 1);

      BEGIN
        v_form := public.create_patient_form_for_crm(p_coach_id, p_student_id, v_form_type, v_form_days);
        v_form_url := 'https://onlyfitapp.com/form/' || (v_form ->> 'token');
        v_rule_context := v_rule_context || jsonb_build_object(
          'patient_form_id', v_form ->> 'id',
          'form_token', v_form ->> 'token',
          'form_type', v_form_type,
          'form_name', v_form_name,
          'nome_formulario', v_form_name,
          'form_url', v_form_url,
          'link_formulario', v_form_url,
          'form_expires_in_days', v_form_days,
          'data_limite_formulario', to_char((now() + (v_form_days || ' days')::interval)::date, 'DD/MM/YYYY')
        );
      EXCEPTION
        WHEN OTHERS THEN
          v_rule_context := v_rule_context || jsonb_build_object(
            'form_type', v_form_type,
            'form_name', v_form_name,
            'nome_formulario', v_form_name,
            'form_status', 'not_created',
            'form_error', SQLERRM
          );
      END;
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
      v_rule_context,
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

COMMENT ON FUNCTION public.enqueue_crm_flows_for_event(uuid, uuid, uuid, text, uuid, text, jsonb) IS
  'Queues CRM actions for product/offer/cohort events. Form triggers create public links using configured anamnesis/check rules.';

CREATE OR REPLACE FUNCTION public.enqueue_crm_flows_after_product_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product record;
  v_coach_id uuid;
  v_organization_id uuid;
  v_context jsonb;
BEGIN
  IF NEW.product_id IS NULL OR NEW.buyer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    p.id,
    p.name,
    p.type,
    p.market_item_type,
    p.interval,
    p.source_id,
    p.organization_id,
    p.creator_id,
    p.tenant_id
  INTO v_product
  FROM public.products p
  WHERE p.id = NEW.product_id;

  IF v_product.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_coach_id := COALESCE(v_product.creator_id, v_product.tenant_id);
  v_organization_id := v_product.organization_id;

  IF v_organization_id IS NULL AND v_coach_id IS NOT NULL THEN
    SELECT cr.organization_id
    INTO v_organization_id
    FROM public.coach_relationships cr
    WHERE cr.coach_id = v_coach_id
      AND cr.student_id = NEW.buyer_id
      AND cr.status = 'active'
      AND cr.organization_id IS NOT NULL
    ORDER BY cr.updated_at DESC NULLS LAST, cr.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_coach_id IS NULL OR v_organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_context := jsonb_build_object(
    'purchase_id', NEW.id,
    'idempotency_key', 'product_purchase:' || NEW.id::text,
    'product_id', NEW.product_id,
    'product_name', COALESCE(v_product.name, 'Produto'),
    'nome_produto', COALESCE(v_product.name, 'Produto'),
    'product_type', COALESCE(v_product.market_item_type, v_product.type, 'produto'),
    'tipo_produto', COALESCE(v_product.market_item_type, v_product.type, 'produto'),
    'plan_name', COALESCE(v_product.name, 'Plano'),
    'nome_plano', COALESCE(v_product.name, 'Plano'),
    'plan_period', COALESCE(v_product.interval, ''),
    'periodo_plano', COALESCE(v_product.interval, ''),
    'amount', COALESCE(NEW.amount, 0),
    'valor_pagamento', COALESCE(NEW.amount, 0)::text,
    'access_type', COALESCE(NEW.access_type::text, ''),
    'link_app', 'https://onlyfitapp.com'
  );

  PERFORM *
  FROM public.enqueue_crm_flows_for_event(
    v_organization_id,
    v_coach_id,
    NEW.buyer_id,
    'product',
    NEW.product_id,
    'ON_PURCHASE_COMPLETED',
    v_context
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'enqueue_crm_flows_after_product_purchase skipped purchase %, error: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS product_purchases_enqueue_crm_flows ON public.product_purchases;
CREATE TRIGGER product_purchases_enqueue_crm_flows
AFTER INSERT ON public.product_purchases
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_crm_flows_after_product_purchase();

REVOKE ALL ON FUNCTION public.enqueue_crm_flows_after_product_purchase()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_crm_flows_after_product_purchase()
  TO service_role;

COMMENT ON FUNCTION public.enqueue_crm_flows_after_product_purchase() IS
  'Database-level product purchase trigger for CRM flows. Payment gateways only need to create product_purchases.';
