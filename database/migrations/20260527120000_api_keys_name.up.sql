-- Add human-readable label for API keys (admin UI).

BEGIN;

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS name VARCHAR(120);

UPDATE api_keys SET name = CONCAT('API Key #', id) WHERE name IS NULL OR TRIM(name) = '';

ALTER TABLE api_keys
  ALTER COLUMN name SET NOT NULL;

COMMIT;
