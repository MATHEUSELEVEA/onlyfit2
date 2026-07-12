-- authenticated needs SELECT on professional_shell_enabled (AuthContext profile fetch).
-- New columns from ADD COLUMN can omit SELECT for authenticated depending on table defaults.

GRANT SELECT (professional_shell_enabled) ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
