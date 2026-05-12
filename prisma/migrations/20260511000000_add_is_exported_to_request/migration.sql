-- AlterTable
ALTER TABLE "Request" ADD COLUMN "is_exported" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Request" ADD COLUMN "exported_at" TIMESTAMP(3);
