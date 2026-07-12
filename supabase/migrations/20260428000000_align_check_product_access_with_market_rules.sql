-- Keep the secondary product access checker aligned with the Market free-access rules.

CREATE OR REPLACE FUNCTION public.check_product_access(
  p_product_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  has_access BOOLEAN,
  access_type TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_benefit BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product RECORD;
  v_purchase RECORD;
  v_is_student BOOLEAN := FALSE;
  v_is_member BOOLEAN := FALSE;
  v_owner_ids UUID[];
  v_student_can_claim_free BOOLEAN := FALSE;
  v_member_can_claim_free BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'not_found'::TEXT, NULL::TIMESTAMP WITH TIME ZONE, FALSE;
    RETURN;
  END IF;

  v_owner_ids := array_remove(ARRAY[v_product.tenant_id, v_product.creator_id], NULL);
  v_student_can_claim_free := COALESCE(v_product.is_free_for_students, FALSE)
    OR COALESCE(v_product.price_student, -1) = 0;
  v_member_can_claim_free := COALESCE(v_product.is_free_for_members, FALSE)
    OR COALESCE(v_product.price_member, -1) = 0;

  SELECT pp.*
  INTO v_purchase
  FROM public.product_purchases pp
  WHERE pp.buyer_id = p_user_id
    AND pp.product_id = p_product_id
    AND (pp.expires_at IS NULL OR pp.expires_at > NOW())
  ORDER BY
    CASE WHEN pp.access_type = 'purchase' THEN 0 ELSE 1 END,
    pp.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_purchase.access_type = 'benefit_student' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.coach_relationships
        WHERE student_id = p_user_id
          AND status = 'active'
          AND coach_id = ANY(v_owner_ids)
      ) INTO v_is_student;

      IF v_is_student THEN
        RETURN QUERY SELECT TRUE, 'benefit_student'::TEXT, v_purchase.expires_at, TRUE;
        RETURN;
      END IF;
    ELSIF v_purchase.access_type = 'benefit_member' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.subscriptions
        WHERE subscriber_id = p_user_id
          AND status = 'active'
          AND creator_id = ANY(v_owner_ids)
      ) INTO v_is_member;

      IF v_is_member THEN
        RETURN QUERY SELECT TRUE, 'benefit_member'::TEXT, v_purchase.expires_at, TRUE;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT TRUE, 'purchase'::TEXT, v_purchase.expires_at, FALSE;
      RETURN;
    END IF;
  END IF;

  IF COALESCE(v_product.price_public, 0) = 0 THEN
    RETURN QUERY SELECT TRUE, 'purchase'::TEXT, NULL::TIMESTAMP WITH TIME ZONE, FALSE;
    RETURN;
  END IF;

  IF v_student_can_claim_free THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.coach_relationships
      WHERE student_id = p_user_id
        AND status = 'active'
        AND coach_id = ANY(v_owner_ids)
    ) INTO v_is_student;

    IF v_is_student THEN
      RETURN QUERY SELECT TRUE, 'benefit_student'::TEXT, NULL::TIMESTAMP WITH TIME ZONE, TRUE;
      RETURN;
    END IF;
  END IF;

  IF v_member_can_claim_free THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.subscriptions
      WHERE subscriber_id = p_user_id
        AND status = 'active'
        AND creator_id = ANY(v_owner_ids)
    ) INTO v_is_member;

    IF v_is_member THEN
      RETURN QUERY SELECT TRUE, 'benefit_member'::TEXT, NULL::TIMESTAMP WITH TIME ZONE, TRUE;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT FALSE, 'none'::TEXT, NULL::TIMESTAMP WITH TIME ZONE, FALSE;
END;
$$;

COMMENT ON FUNCTION public.check_product_access(UUID, UUID) IS 'Verifica acesso a produtos do Market alinhado com grant_free_market_product, incluindo tenant_id/creator_id, subscriptions atuais e preço zero para aluno/membro.';
