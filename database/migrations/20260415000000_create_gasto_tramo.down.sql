-- [M1-004] Migración DB — Rollback tabla gasto_tramo
-- Postgres migration (DOWN)

BEGIN;

DROP TABLE IF EXISTS gasto_tramo;

COMMIT;
