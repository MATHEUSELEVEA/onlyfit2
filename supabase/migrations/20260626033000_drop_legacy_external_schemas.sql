-- Remove schemas that do not belong to the Pulse product database contract.
-- `claude` and `agentics` are included defensively; they may already be absent.

DROP SCHEMA IF EXISTS claude CASCADE;
DROP SCHEMA IF EXISTS agentics CASCADE;
DROP SCHEMA IF EXISTS wedding CASCADE;
