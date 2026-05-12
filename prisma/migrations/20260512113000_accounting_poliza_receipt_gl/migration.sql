-- Pólizas persistidas + columnas US-24 en Receipt_Type + RLS tenant

ALTER TABLE "Receipt_Type" ADD COLUMN IF NOT EXISTS "gasto_gl_account_code" VARCHAR(10);
ALTER TABLE "Receipt_Type" ADD COLUMN IF NOT EXISTS "iva_gl_account_code" VARCHAR(10);

CREATE TABLE IF NOT EXISTS "accounting_poliza" (
    "id" TEXT NOT NULL,
    "organization_id" BIGINT NOT NULL,
    "request_id" INTEGER NOT NULL,
    "poliza_index" INTEGER NOT NULL,
    "doc_type" VARCHAR(2) NOT NULL,
    "payload" JSONB NOT NULL,
    "request_marked_exported" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_poliza_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounting_poliza_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "accounting_poliza_request_id_fkey"
        FOREIGN KEY ("request_id") REFERENCES "Request"("request_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "accounting_poliza_organization_id_created_at_idx"
    ON "accounting_poliza" ("organization_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "accounting_poliza_request_id_poliza_index_idx"
    ON "accounting_poliza" ("request_id", "poliza_index");

ALTER TABLE "accounting_poliza" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "accounting_poliza";
CREATE POLICY tenant_isolation ON "accounting_poliza" USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::bigint
    OR current_setting('app.bypass_tenant', true) = 'on'
) WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::bigint
    OR current_setting('app.bypass_tenant', true) = 'on'
);
