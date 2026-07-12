-- Remove a trava de 50 alunos/assinantes para criar produtos no Market.
-- Qualquer creator pode criar produtos; a validação de tenant_id/creator_id é mantida.

CREATE OR REPLACE FUNCTION public.check_creator_can_create_market_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
BEGIN
  v_creator_id := COALESCE(NEW.tenant_id, NEW.creator_id);
  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'market_creator_required: produto do Market deve ter tenant_id ou creator_id.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_creator_can_create_market_product() IS 'Valida apenas tenant_id/creator_id em INSERT em products. Trava de 50 alunos foi removida.';

-- Elegibilidade: qualquer creator pode criar; retorno mantém contagem informativa.
CREATE OR REPLACE FUNCTION public.get_creator_market_eligibility(p_creator_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'can_create_market_products', true,
    'active_students_count',     (SELECT COUNT(*)::INT FROM coach_relationships WHERE coach_id = p_creator_id AND status = 'active'),
    'required_students',          0
  );
$$;

COMMENT ON FUNCTION public.get_creator_market_eligibility(UUID) IS 'Retorna elegibilidade para Market: criação liberada (required_students=0); active_students_count apenas informativo.';
