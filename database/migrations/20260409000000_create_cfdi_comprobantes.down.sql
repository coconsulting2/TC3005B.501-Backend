-- [M1-001] Migración DB — Tabla CFDI con campos fiscales
-- Postgres migration (DOWN)

BEGIN;

DROP TABLE IF EXISTS cfdi_comprobantes;

-- Drop parent tables created by the UP migration (safe if not present).
DROP TABLE IF EXISTS viajes;
DROP TABLE IF EXISTS organizaciones;

COMMIT;
