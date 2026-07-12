-- RPC para buscar fotos de anamnese de forma eficiente
-- Evita buscar todas as fotos do aluno e filtrar no frontend

CREATE OR REPLACE FUNCTION public.get_anamnesis_submission_photos(p_submission_id UUID)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  student_id UUID,
  captured_at TIMESTAMPTZ,
  angle TEXT,
  weight_kg NUMERIC,
  body_fat_pct NUMERIC,
  notes TEXT,
  bucket TEXT,
  object_key TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  anamnesis_submission_id UUID,
  check_submission_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    spp.id,
    spp.tenant_id,
    spp.student_id,
    spp.captured_at,
    spp.angle,
    spp.weight_kg,
    spp.body_fat_pct,
    spp.notes,
    spp.bucket,
    spp.object_key,
    spp.created_by,
    spp.created_at,
    spp.updated_at,
    spp.anamnesis_submission_id,
    spp.check_submission_id
  FROM public.student_progress_photos spp
  WHERE spp.anamnesis_submission_id = p_submission_id
  ORDER BY spp.captured_at ASC, spp.angle ASC;
END;
$$;
COMMENT ON FUNCTION public.get_anamnesis_submission_photos IS 'Busca fotos vinculadas a uma submissão de anamnese específica de forma eficiente usando índice parcial.';
-- Grant execute para authenticated users
GRANT EXECUTE ON FUNCTION public.get_anamnesis_submission_photos(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_anamnesis_submission_photos(UUID) TO service_role;
