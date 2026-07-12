-- App schema security hardening.
-- Avoids Supabase-managed schemas (auth/storage/realtime) and only closes app-owned surfaces.

-- 1) App-owned tables with RLS enabled and no policies fail closed explicitly.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND n.nspname IN ('claude_agentics', 'clinical', 'public', 'wedding')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policy pol
        WHERE pol.polrelid = c.oid
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS deny_all_client_access ON %I.%I', r.schema_name, r.table_name);
    EXECUTE format(
      'CREATE POLICY deny_all_client_access ON %I.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      r.schema_name,
      r.table_name
    );
  END LOOP;
END $$;

-- 2) App-owned views should execute with invoker permissions/RLS.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS view_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'v'
      AND n.nspname IN ('claude_agentics', 'clinical', 'public', 'wedding')
      AND NOT (
        COALESCE(c.reloptions, '{}') @> ARRAY['security_invoker=true']
        OR COALESCE(c.reloptions, '{}') @> ARRAY['security_invoker=on']
      )
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', r.schema_name, r.view_name);
  END LOOP;
END $$;

-- 3) Pin search_path on app-owned functions to prevent search-path hijacking.
DO $$
DECLARE
  r record;
  path text;
BEGIN
  FOR r IN
    SELECT p.oid,
           n.nspname AS schema_name,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('claude_agentics', 'clinical', 'public', 'wedding')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    path := CASE r.schema_name
      WHEN 'public' THEN 'public, auth, storage, extensions, net, pg_temp'
      ELSE format('%I, public, auth, storage, extensions, net, pg_temp', r.schema_name)
    END;

    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = %s',
      r.schema_name,
      r.function_name,
      r.identity_args,
      path
    );
  END LOOP;
END $$;
