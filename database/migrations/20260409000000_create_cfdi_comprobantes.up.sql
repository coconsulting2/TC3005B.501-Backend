-- [M1-001] Migración DB — Tabla CFDI con campos fiscales
-- Postgres migration (UP)

BEGIN;

-- Minimal parent tables to support required FKs on a fresh environment.
-- If your project already has these tables, remove these blocks and keep only cfdi_comprobantes.
CREATE TABLE IF NOT EXISTS organizaciones (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS viajes (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT viajes_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES organizaciones(id)
);

CREATE TABLE IF NOT EXISTS cfdi_comprobantes (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL,
  rfc_emisor VARCHAR(13) NOT NULL,
  rfc_receptor VARCHAR(13) NOT NULL,
  fecha_emision TIMESTAMPTZ NOT NULL,
  monto_total NUMERIC(18, 2) NOT NULL,
  impuestos JSONB NOT NULL,
  tipo_cambio NUMERIC(18, 6),
  viaje_id BIGINT NOT NULL,
  org_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cfdi_comprobantes_uuid_key UNIQUE (uuid),
  CONSTRAINT cfdi_comprobantes_viaje_id_fkey
    FOREIGN KEY (viaje_id) REFERENCES viajes(id),
  CONSTRAINT cfdi_comprobantes_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES organizaciones(id)
);

COMMIT;
