-- [M1-002] Migración DB — Campos fiscales en organizaciones + tabla proveedores
-- Postgres migration (UP)

BEGIN;

-- Add business/fiscal fields to organizaciones
ALTER TABLE organizaciones
  ADD COLUMN IF NOT EXISTS nombre       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS razon_social VARCHAR(200),
  ADD COLUMN IF NOT EXISTS rfc          VARCHAR(13);

-- Unique constraint on RFC (each org has a unique tax ID)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizaciones_rfc_key'
  ) THEN
    ALTER TABLE organizaciones
      ADD CONSTRAINT organizaciones_rfc_key UNIQUE (rfc);
  END IF;
END$$;

-- Suppliers table linked to an organization
-- RFCs use SAT generic test values: XAXX010101000 / XEXX010101000
CREATE TABLE IF NOT EXISTS proveedores (
  id           BIGSERIAL    PRIMARY KEY,
  org_id       BIGINT       NOT NULL,
  nombre       VARCHAR(100) NOT NULL,
  razon_social VARCHAR(200),
  rfc          VARCHAR(13)  NOT NULL,
  email        VARCHAR(254),
  telefono     VARCHAR(20),
  activo       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT proveedores_org_id_fkey    FOREIGN KEY (org_id) REFERENCES organizaciones(id),
  CONSTRAINT proveedores_org_nombre_key UNIQUE (org_id, nombre)
);

COMMIT;
