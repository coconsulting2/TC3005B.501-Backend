CREATE TABLE "empleado" (
    "empleado_id" SERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL,
    "no_empleado" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100),
    "jefe_inmediato" VARCHAR(10),
    "proveedor" VARCHAR(11) NOT NULL,
    "ceco" VARCHAR(10) NOT NULL,
    "status" VARCHAR(1) NOT NULL DEFAULT 'A',
    "fecha_alta" DATE NOT NULL,
    "fecha_ultima_modificacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_ultima_modificacion" VARCHAR(30) NOT NULL,
    CONSTRAINT "empleado_pkey" PRIMARY KEY ("empleado_id")
);

CREATE UNIQUE INDEX "empleado_organization_id_no_empleado_key"
ON "empleado" ("organization_id", "no_empleado");

CREATE INDEX "empleado_organization_id_status_idx"
ON "empleado" ("organization_id", "status");

CREATE INDEX "empleado_organization_id_jefe_inmediato_idx"
ON "empleado" ("organization_id", "jefe_inmediato");

ALTER TABLE "empleado"
ADD CONSTRAINT "empleado_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
