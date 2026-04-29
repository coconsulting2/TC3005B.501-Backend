-- [M2-006] Sustitutos de autorizadores (UP)

BEGIN;

CREATE TABLE IF NOT EXISTS approval_substitutes (
  id BIGSERIAL PRIMARY KEY,
  approver_id INT NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
  substitute_id INT NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (valid_to > valid_from),
  CHECK (approver_id <> substitute_id)
);

CREATE INDEX IF NOT EXISTS idx_approval_substitutes_approver_dates
  ON approval_substitutes (approver_id, valid_from, valid_to);

COMMIT;
