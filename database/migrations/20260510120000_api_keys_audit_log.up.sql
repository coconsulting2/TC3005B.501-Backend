-- [API keys] api_keys + api_key_logs (PostgreSQL).
-- En MariaDB el equivalente lógico usa JSON, CHAR(64) y los mismos índices.

BEGIN;

CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL,
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  scope JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by INT NOT NULL REFERENCES "User"(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON api_keys (org_id);

CREATE TABLE IF NOT EXISTS api_key_logs (
  id BIGSERIAL PRIMARY KEY,
  key_id INT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  response_code INT NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_logs_key_ts
  ON api_key_logs (key_id, "timestamp" DESC);

COMMIT;
