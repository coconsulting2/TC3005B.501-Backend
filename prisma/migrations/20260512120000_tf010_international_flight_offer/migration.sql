-- TF-010: comprobantes internacionales (tipo distinto a un solo char) + oferta de vuelo en solicitud
ALTER TABLE "cfdi_comprobantes" ALTER COLUMN "tipo_comprobante" TYPE VARCHAR(20);

ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "selected_flight_offer" JSONB;
