-- create_patient_form generates public form tokens with pgcrypto.
-- Keep `public` first for existing table references and add `extensions`
-- so gen_random_bytes resolves at runtime.

ALTER FUNCTION public.create_patient_form(uuid, text, integer)
  SET search_path TO 'public', 'extensions';
