-- MVP 2 — claim de Local: negócio reivindica um local ainda sem dono.
-- SECURITY DEFINER porque o primeiro claim define claimed_by (que a RLS de UPDATE
-- ainda não permitiria ao não-dono). Só permite claim quando claimed_by IS NULL.
CREATE OR REPLACE FUNCTION public.claim_place(p_place_id uuid)
RETURNS public.places
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.places;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.places
     SET claimed_by = v_uid, updated_at = now()
   WHERE id = p_place_id AND claimed_by IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'place_already_claimed_or_missing';
  END IF;

  INSERT INTO public.place_members (place_id, user_id, role, status)
  VALUES (p_place_id, v_uid, 'owner', 'active')
  ON CONFLICT (place_id, user_id) DO UPDATE SET role = 'owner', status = 'active';

  RETURN v_row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_place(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_place(uuid) TO authenticated;
