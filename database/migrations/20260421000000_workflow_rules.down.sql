-- [M2-004] Workflow rules (DOWN)

BEGIN;

DROP TABLE IF EXISTS workflow_rules;

ALTER TABLE "Request"
  DROP COLUMN IF EXISTS workflow_post_snapshot,
  DROP COLUMN IF EXISTS workflow_pre_snapshot;

DROP INDEX IF EXISTS idx_user_org_id;

ALTER TABLE "User"
  DROP COLUMN IF EXISTS org_id;

COMMIT;
