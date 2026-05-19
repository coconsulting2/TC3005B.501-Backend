-- Desglose de impuestos CFDI (traslados / retenciones) para exportación contable GV.
ALTER TABLE "cfdi_comprobantes"
  ADD COLUMN IF NOT EXISTS "impuestos" JSONB,
  ADD COLUMN IF NOT EXISTS "total_retenidos" DOUBLE PRECISION NOT NULL DEFAULT 0;
