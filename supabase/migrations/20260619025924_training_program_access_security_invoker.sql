-- Evita SECURITY DEFINER exposto em RPC pública. O cálculo privilegiado segue
-- isolado em private.training_program_entitlement_source, fora dos schemas REST.

GRANT EXECUTE ON FUNCTION private.training_program_entitlement_source(uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.training_program_access(p_program_id uuid)
RETURNS TABLE (
  program_id uuid,
  can_view boolean,
  locked_reason text,
  entitlement_source text,
  product_id uuid,
  product_price numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
  WITH entitlement AS (
    SELECT private.training_program_entitlement_source(p_program_id, (select auth.uid())) AS source
  ),
  market_product AS (
    SELECT pr.id, coalesce(pr.price_public, pr.price, 0)::numeric AS price
    FROM public.products pr
    WHERE pr.market_item_type = 'training_program'
      AND pr.source_id = p_program_id
      AND coalesce(pr.active, true) = true
      AND coalesce(pr.is_published, false) = true
    ORDER BY pr.created_at DESC
    LIMIT 1
  )
  SELECT
    p_program_id AS program_id,
    entitlement.source IS NOT NULL
      AND entitlement.source NOT IN ('not_found', 'unauthenticated') AS can_view,
    CASE
      WHEN entitlement.source = 'not_found' THEN 'not_found'
      WHEN entitlement.source = 'unauthenticated' THEN 'unauthenticated'
      WHEN entitlement.source IS NULL THEN 'premium_required'
      ELSE NULL
    END AS locked_reason,
    entitlement.source AS entitlement_source,
    market_product.id AS product_id,
    market_product.price AS product_price
  FROM entitlement
  LEFT JOIN market_product ON true;
$$;

REVOKE EXECUTE ON FUNCTION public.training_program_access(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.training_program_access(uuid) TO anon, authenticated;
