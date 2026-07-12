CREATE OR REPLACE FUNCTION public.pulse_scan_overdue_charges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.pulse_action_outbox (student_id, coach_id, channel, trigger_type, context_data)
  SELECT
    c.student_id,
    c.coach_id,
    'WHATSAPP',
    'PAYMENT_FAILED',
    jsonb_build_object(
      'amount', c.amount_due,
      'due_date', c.due_date,
      'dunning_level', 1,
      'charge_id', c.id,
      'payment_url', rel.checkout_url
    )
  FROM public.pulse_charges c
  LEFT JOIN LATERAL (
    SELECT NULLIF(TRIM(cr.checkout_url), '') AS checkout_url
    FROM public.coach_relationships cr
    WHERE cr.coach_id = c.coach_id
      AND cr.student_id = c.student_id
    ORDER BY cr.updated_at DESC NULLS LAST, cr.created_at DESC NULLS LAST
    LIMIT 1
  ) rel ON true
  WHERE c.status = 'OPEN'
    AND c.due_date < NOW()
    AND c.dunning_level = 0
    AND public.pulse_flow_delivery_allowed(c.coach_id, 'PAYMENT_FAILED', c.student_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.pulse_action_outbox pao
      WHERE pao.trigger_type = 'PAYMENT_FAILED'
        AND (pao.context_data->>'charge_id') = c.id::text
        AND pao.status IN ('PENDING', 'PROCESSING_TEXTGEN', 'QUEUED_FOR_DELIVERY', 'SENDING')
    );

  UPDATE public.pulse_charges c
  SET dunning_level = 1, last_dunning_at = NOW()
  WHERE c.status = 'OPEN'
    AND c.due_date < NOW()
    AND c.dunning_level = 0
    AND public.pulse_flow_delivery_allowed(c.coach_id, 'PAYMENT_FAILED', c.student_id);

  INSERT INTO public.pulse_action_outbox (student_id, coach_id, channel, trigger_type, context_data)
  SELECT
    c.student_id,
    c.coach_id,
    'WHATSAPP',
    'PAYMENT_WARNING_3_DAYS',
    jsonb_build_object(
      'amount', c.amount_due,
      'due_date', c.due_date,
      'dunning_level', 2,
      'charge_id', c.id,
      'payment_url', rel.checkout_url
    )
  FROM public.pulse_charges c
  LEFT JOIN LATERAL (
    SELECT NULLIF(TRIM(cr.checkout_url), '') AS checkout_url
    FROM public.coach_relationships cr
    WHERE cr.coach_id = c.coach_id
      AND cr.student_id = c.student_id
    ORDER BY cr.updated_at DESC NULLS LAST, cr.created_at DESC NULLS LAST
    LIMIT 1
  ) rel ON true
  WHERE c.status = 'OPEN'
    AND c.due_date < NOW() - INTERVAL '3 days'
    AND c.dunning_level = 1
    AND public.pulse_flow_delivery_allowed(c.coach_id, 'PAYMENT_WARNING_3_DAYS', c.student_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.pulse_action_outbox pao
      WHERE pao.trigger_type = 'PAYMENT_WARNING_3_DAYS'
        AND (pao.context_data->>'charge_id') = c.id::text
        AND pao.status IN ('PENDING', 'PROCESSING_TEXTGEN', 'QUEUED_FOR_DELIVERY', 'SENDING')
    );

  UPDATE public.pulse_charges c
  SET dunning_level = 2, last_dunning_at = NOW()
  WHERE c.status = 'OPEN'
    AND c.due_date < NOW() - INTERVAL '3 days'
    AND c.dunning_level = 1
    AND public.pulse_flow_delivery_allowed(c.coach_id, 'PAYMENT_WARNING_3_DAYS', c.student_id);

  UPDATE public.profiles p
  SET app_lockdown = true, lockdown_reason = 'PAYMENT_OVERDUE'
  WHERE p.id IN (
    SELECT c.student_id
    FROM public.pulse_charges c
    WHERE c.status = 'OPEN'
      AND c.due_date < NOW() - INTERVAL '5 days'
      AND c.dunning_level < 3
  );

  UPDATE public.pulse_charges c
  SET dunning_level = 3, last_dunning_at = NOW()
  WHERE c.status = 'OPEN'
    AND c.due_date < NOW() - INTERVAL '5 days'
    AND c.dunning_level < 3;
END;
$$;
