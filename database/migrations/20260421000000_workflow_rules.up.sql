-- [M2-004] Configuración dinámica de workflow de aprobación (UP)

BEGIN;

-- Optional org scope on users (for workflow rules and N1/N2 resolution)
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS org_id BIGINT REFERENCES organizaciones(id);

CREATE INDEX IF NOT EXISTS idx_user_org_id ON "User"(org_id);

-- Snapshots: reglas aplicadas solo al crear / confirmar solicitud (no afecta históricas sin datos)
ALTER TABLE "Request"
  ADD COLUMN IF NOT EXISTS workflow_pre_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS workflow_post_snapshot JSONB;

COMMENT ON COLUMN "Request".workflow_pre_snapshot IS 'Ruta pre-viaje (autorización): niveles, aprobadores, reglas evaluadas al alta';
COMMENT ON COLUMN "Request".workflow_post_snapshot IS 'Ruta post-viaje (comprobación): para validación de gastos';

CREATE TABLE IF NOT EXISTS workflow_rules (
  id             BIGSERIAL PRIMARY KEY,
  org_id         BIGINT NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  rule_type      VARCHAR(10) NOT NULL CHECK (rule_type IN ('pre', 'post')),
  param_type     VARCHAR(20) NOT NULL CHECK (param_type IN ('importe', 'nivel', 'gasto', 'destino', 'moneda')),
  threshold      NUMERIC(18, 4),
  param_value    VARCHAR(100),
  approval_level INT NOT NULL CHECK (approval_level >= 1 AND approval_level <= 2),
  skip_if_below  NUMERIC(18, 4),
  priority       INT NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_rules_org_type ON workflow_rules(org_id, rule_type, active);

COMMENT ON TABLE workflow_rules IS 'Reglas de flujo por org; param_value para nivel/gasto/destino/moneda; threshold bandas de importe';
COMMENT ON COLUMN workflow_rules.skip_if_below IS 'Si importe evaluado < este umbral, se omiten niveles inferiores a approval_level';

COMMIT;
