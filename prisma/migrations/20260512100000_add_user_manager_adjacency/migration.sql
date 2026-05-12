ALTER TABLE "User"
ADD COLUMN "manager_user_id" INTEGER;

CREATE INDEX "User_organization_id_manager_user_id_idx"
ON "User" ("organization_id", "manager_user_id");

ALTER TABLE "User"
ADD CONSTRAINT "User_manager_user_id_fkey"
FOREIGN KEY ("manager_user_id") REFERENCES "User"("user_id")
ON DELETE SET NULL
ON UPDATE CASCADE;
