-- Pólizas AV persistidas al aprobar solicitud (requested_fee) y al finalizar comprobación (imposed_fee).

CREATE TABLE "anticipo_poliza_snapshot" (
    "id" SERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL,
    "request_id" INTEGER NOT NULL,
    "phase" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anticipo_poliza_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "anticipo_poliza_request_phase_unique" ON "anticipo_poliza_snapshot" ("request_id", "phase");

CREATE INDEX "anticipo_poliza_snapshot_organization_id_created_at_idx" ON "anticipo_poliza_snapshot" ("organization_id", "created_at");

ALTER TABLE "anticipo_poliza_snapshot" ADD CONSTRAINT "anticipo_poliza_snapshot_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "anticipo_poliza_snapshot" ADD CONSTRAINT "anticipo_poliza_snapshot_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "Request" ("request_id") ON DELETE CASCADE ON UPDATE CASCADE;
