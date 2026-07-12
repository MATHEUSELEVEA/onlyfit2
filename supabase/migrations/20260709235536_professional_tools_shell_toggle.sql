-- Preferência de shell profissional (perfil combinado).
-- Estrutural (account_kind / professional_types) ≠ separado da superfície de UI
-- (Gestão / Negócios / home → /management). Toggle no Perfil liga/desliga a superfície
-- sem destruir orgs nem força re-onboarding.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS professional_shell_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.professional_shell_enabled IS
  'When true and user is professional (account_kind/types/etc), show Gestão/Negócios and land on /management. Soft preference: disabling does not demote account_kind.';

-- Atletas que ainda não viraram profissionais começam com shell "off" até ativarem o toggle.
UPDATE public.profiles
SET professional_shell_enabled = false
WHERE COALESCE(account_kind, 'athlete') = 'athlete'
  AND COALESCE(is_creator, false) = false
  AND COALESCE(default_workspace, 'student') = 'student'
  AND COALESCE(onboarding_track, 'athlete') = 'athlete'
  AND cardinality(COALESCE(professional_types, ARRAY[]::text[])) = 0
  AND professional_shell_enabled = true;

CREATE OR REPLACE FUNCTION public.set_professional_tools_enabled(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
  v_types text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'p_enabled required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_enabled THEN
    v_types := COALESCE(v_row.professional_types, ARRAY[]::text[]);
    IF cardinality(v_types) = 0 THEN
      v_types := ARRAY['personal_trainer']::text[];
    END IF;

    UPDATE public.profiles
    SET
      account_kind = 'professional',
      professional_types = v_types,
      default_workspace = CASE
        WHEN COALESCE(default_workspace, 'student') = 'student' THEN 'coach'
        ELSE default_workspace
      END,
      onboarding_track = CASE
        WHEN COALESCE(onboarding_track, 'athlete') = 'athlete' THEN 'personal_trainer'
        ELSE onboarding_track
      END,
      professional_shell_enabled = true,
      onboarding_completed = true
    WHERE id = v_uid
    RETURNING * INTO v_row;
  ELSE
    -- Soft off: keep identity/orgs; hide pro shell surfaces.
    UPDATE public.profiles
    SET professional_shell_enabled = false
    WHERE id = v_uid
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'account_kind', v_row.account_kind,
    'default_workspace', v_row.default_workspace,
    'onboarding_track', v_row.onboarding_track,
    'professional_types', to_jsonb(v_row.professional_types),
    'professional_shell_enabled', v_row.professional_shell_enabled,
    'is_creator', v_row.is_creator
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_professional_tools_enabled(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_professional_tools_enabled(boolean) TO authenticated;

COMMENT ON FUNCTION public.set_professional_tools_enabled(boolean) IS
  'Own-user only. enabled=true promotes to professional + shows Gestão/Negócios; enabled=false hides pro shell without demoting.';

-- AuthContext SELECT includes this column; without SELECT, every authenticated profile fetch fails.
GRANT SELECT (professional_shell_enabled) ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
