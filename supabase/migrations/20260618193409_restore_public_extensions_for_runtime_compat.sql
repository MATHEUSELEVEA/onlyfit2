-- Runtime compatibility fix.
-- Some PostgREST/RPC paths call extension functions such as unaccent(text)
-- without schema qualification. Keep these extensions in public until those
-- SQL contracts are migrated to qualified references.

ALTER EXTENSION unaccent SET SCHEMA public;
ALTER EXTENSION pg_trgm SET SCHEMA public;
ALTER EXTENSION vector SET SCHEMA public;
