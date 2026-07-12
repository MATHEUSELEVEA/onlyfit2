-- Allow organization RPCs to append audit events after the owner/admin member
-- relationship is created. Reads remain restricted by the existing SELECT policy;
-- there are still no UPDATE or DELETE policies for audit rows.
DROP POLICY IF EXISTS "organization_audit_log_insert_admin" ON public.organization_audit_log;
CREATE POLICY "organization_audit_log_insert_admin" ON public.organization_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = (select auth.uid())
    AND private.is_organization_admin(organization_id, (select auth.uid()))
  );

-- Keep publish requirements aligned with the simplified business form.
CREATE OR REPLACE FUNCTION public.publish_organization(p_organization_id uuid)
RETURNS public.organizations
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.organizations;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
    INTO v_row
  FROM public.organizations
  WHERE id = p_organization_id
    AND (owner_id = v_uid OR private.is_organization_admin(id, v_uid))
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'organization_not_found';
  END IF;

  IF NULLIF(trim(v_row.name), '') IS NULL
    OR v_row.slug !~ '^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$'
    OR v_row.service_mode NOT IN ('online', 'in_person', 'hybrid')
    OR length(COALESCE(trim(v_row.bio), '')) < 8
    OR (v_row.kind IN ('sports_consultancy','facility','content_creator') AND cardinality(v_row.sports) = 0)
  THEN
    RAISE EXCEPTION 'publish_requirements_missing';
  END IF;

  UPDATE public.organizations
     SET status = 'published',
         published_at = COALESCE(published_at, now()),
         updated_at = now()
   WHERE id = p_organization_id
  RETURNING * INTO v_row;

  INSERT INTO public.organization_audit_log (organization_id, actor_id, action, previous_status, next_status)
  VALUES (v_row.id, v_uid, 'published', 'draft', v_row.status);

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.publish_organization(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_organization(uuid) TO authenticated;
