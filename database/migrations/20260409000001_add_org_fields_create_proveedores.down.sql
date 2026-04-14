-- [M1-002] Migración DB — Campos fiscales en organizaciones + tabla proveedores
-- Postgres migration (DOWN)

BEGIN;

DROP TABLE IF EXISTS proveedores;

ALTER TABLE organizaciones
  DROP COLUMN IF EXISTS nombre,
  DROP COLUMN IF EXISTS razon_social,
  DROP COLUMN IF EXISTS rfc;

COMMIT;
