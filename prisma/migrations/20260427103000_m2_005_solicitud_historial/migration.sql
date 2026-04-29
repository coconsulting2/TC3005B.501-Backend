-- CreateEnum
CREATE TYPE "solicitud_historial_accion" AS ENUM ('APROBADO', 'RECHAZADO', 'ESCALADO', 'REASIGNADO');

-- AlterTable
ALTER TABLE "Role" ADD COLUMN "max_approval_amount" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "solicitud_historial" (
    "historial_id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "accion" "solicitud_historial_accion" NOT NULL,
    "comentario" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitud_historial_pkey" PRIMARY KEY ("historial_id")
);

-- CreateIndex
CREATE INDEX "solicitud_historial_request_id_created_at_idx" ON "solicitud_historial"("request_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "solicitud_historial" ADD CONSTRAINT "solicitud_historial_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "Request"("request_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_historial" ADD CONSTRAINT "solicitud_historial_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
