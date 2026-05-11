-- [API keys] rollback

BEGIN;

DROP TABLE IF EXISTS api_key_logs;
DROP TABLE IF EXISTS api_keys;

COMMIT;
