-- Public anamnesis links need to freeze the selected model on patient_forms.
-- Some production databases were missing the column because legacy migrations
-- lived outside the applied migrations folder.

ALTER TABLE public.patient_forms
  ADD COLUMN IF NOT EXISTS anamnesis_template_id uuid REFERENCES public.anamnesis_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patient_forms_anamnesis_template_id
  ON public.patient_forms (anamnesis_template_id)
  WHERE anamnesis_template_id IS NOT NULL;
