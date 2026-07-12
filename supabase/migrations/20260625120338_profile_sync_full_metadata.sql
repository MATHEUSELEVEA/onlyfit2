-- Historical mirror of a migration applied directly in the linked Pulse project.
-- This keeps local migration history aligned with supabase_migrations.schema_migrations.

CREATE OR REPLACE FUNCTION public.sync_profile_contacts_from_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_username text;
  v_email text;
  v_phone text;
  v_raw text;
  v_full_name text;
  v_country_code text;
  v_language text;
BEGIN
  v_raw := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(split_part(COALESCE(NEW.email, NEW.id::text), '@', 1), ''),
    ''
  );
  v_username := public.username_allocate_unique(v_raw, NEW.id);

  v_email := NULLIF(trim(NEW.email), '');
  v_phone := NULLIF(trim(NEW.phone), '');

  v_full_name := NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), '');
  v_country_code := NULLIF(upper(trim(NEW.raw_user_meta_data->>'country_code')), '');
  IF v_country_code IS NOT NULL AND length(v_country_code) <> 2 THEN
    v_country_code := NULL;
  END IF;
  v_language := NULLIF(trim(NEW.raw_user_meta_data->>'language'), '');

  PERFORM set_config('app.internal_profile_sync', '1', true);

  INSERT INTO public.profiles (
    id, username, email, phone, email_verified_at, phone_verified_at,
    full_name, country_code, language
  )
  VALUES (
    NEW.id, v_username, v_email, v_phone, NEW.email_confirmed_at, NEW.phone_confirmed_at,
    v_full_name, v_country_code, COALESCE(v_language, 'pt-BR')
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      email_verified_at = EXCLUDED.email_verified_at,
      phone_verified_at = EXCLUDED.phone_verified_at,
      full_name = CASE
        WHEN COALESCE(public.profiles.full_name, '') = '' AND COALESCE(EXCLUDED.full_name, '') <> ''
          THEN EXCLUDED.full_name
        ELSE public.profiles.full_name
      END,
      country_code = CASE
        WHEN COALESCE(public.profiles.country_code, '') = '' AND COALESCE(EXCLUDED.country_code, '') <> ''
          THEN EXCLUDED.country_code
        ELSE public.profiles.country_code
      END,
      language = CASE
        WHEN COALESCE(public.profiles.language, '') = '' AND COALESCE(EXCLUDED.language, '') <> ''
          THEN EXCLUDED.language
        ELSE public.profiles.language
      END;

  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.handle_new_user();
