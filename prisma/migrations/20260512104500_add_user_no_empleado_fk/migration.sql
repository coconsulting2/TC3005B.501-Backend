ALTER TABLE "User"
ADD COLUMN "no_empleado" VARCHAR(10);

CREATE INDEX "User_organization_id_no_empleado_idx"
ON "User" ("organization_id", "no_empleado");

ALTER TABLE "User"
ADD CONSTRAINT "User_organization_id_no_empleado_fkey"
FOREIGN KEY ("organization_id", "no_empleado")
REFERENCES "empleado"("organization_id", "no_empleado")
ON DELETE NO ACTION
ON UPDATE CASCADE;
