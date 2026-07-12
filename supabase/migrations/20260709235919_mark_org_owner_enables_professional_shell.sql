-- Ao criar um negócio, o owner vira profissional com shell ligado
-- (Gestão / Negócios). Preferência soft: o usuário ainda pode desligar no Perfil.

CREATE OR REPLACE FUNCTION private.mark_organization_owner_profile(
  p_user_id uuid,
  p_kind text,
  p_subtype text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_workspace text := CASE
    WHEN p_kind = 'facility' THEN 'facility'
    WHEN p_kind = 'sports_consultancy' THEN 'sports'
    WHEN p_kind = 'brand' THEN 'creator'
    WHEN p_kind = 'content_creator' THEN 'creator'
    WHEN p_subtype = 'nutrition_consultancy' THEN 'nutrition'
    ELSE 'coach'
  END;
  v_track text := CASE
    WHEN p_kind = 'facility' THEN 'facility_owner'
    WHEN p_kind = 'brand' THEN 'brand_owner'
    WHEN p_kind = 'content_creator' THEN 'creator'
    WHEN p_kind = 'sports_consultancy' THEN 'sports_consultancy'
    WHEN p_subtype = 'nutrition_consultancy' THEN 'nutritionist'
    WHEN p_subtype = 'hybrid_consultancy' THEN 'hybrid_professional'
    ELSE 'personal_trainer'
  END;
  v_types text[];
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT array_agg(DISTINCT professional_type ORDER BY professional_type)
    INTO v_types
  FROM (
    SELECT unnest(COALESCE(professional_types, ARRAY[]::text[])) AS professional_type
    FROM public.profiles
    WHERE id = p_user_id
    UNION ALL SELECT private.organization_professional_type(p_kind)
    UNION ALL SELECT CASE WHEN p_subtype IN ('nutrition_consultancy','hybrid_consultancy') THEN 'nutritionist' END
    UNION ALL SELECT CASE WHEN p_subtype IN ('fitness_consultancy','hybrid_consultancy') THEN 'personal_trainer' END
    UNION ALL SELECT p_subtype
  ) AS merged
  WHERE professional_type IS NOT NULL
    AND professional_type <> '';

  UPDATE public.profiles
     SET professional_types = COALESCE(v_types, ARRAY[private.organization_professional_type(p_kind)]::text[]),
         account_kind = 'professional',
         default_workspace = COALESCE(NULLIF(default_workspace, 'student'), v_workspace),
         onboarding_track = COALESCE(NULLIF(onboarding_track, 'athlete'), v_track),
         professional_shell_enabled = true
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION private.mark_organization_owner_profile(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.mark_organization_owner_profile(uuid, text, text) TO authenticated;
