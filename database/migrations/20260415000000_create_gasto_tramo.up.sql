-- [M1-004] Migración DB — Tabla gasto_tramo para gastos por tramo de viaje
-- Postgres migration (UP)

BEGIN;

CREATE TABLE IF NOT EXISTS gasto_tramo (
  gasto_tramo_id SERIAL PRIMARY KEY,
  viaje_id       INTEGER NOT NULL,
  tramo_id       INTEGER NOT NULL,
  comprobante_id INTEGER NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gasto_tramo_comprobante_id_key
    UNIQUE (comprobante_id),

  CONSTRAINT gasto_tramo_viaje_id_fkey
    FOREIGN KEY (viaje_id) REFERENCES "Request"(request_id) ON DELETE CASCADE,

  CONSTRAINT gasto_tramo_tramo_id_fkey
    FOREIGN KEY (tramo_id) REFERENCES "Route"(route_id) ON DELETE CASCADE,

  CONSTRAINT gasto_tramo_comprobante_id_fkey
    FOREIGN KEY (comprobante_id) REFERENCES "Receipt"(receipt_id) ON DELETE CASCADE
);

COMMIT;
