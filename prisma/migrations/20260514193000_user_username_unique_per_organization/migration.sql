-- user_name único por organización (antes era único global en "User").
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_userName_key";

CREATE UNIQUE INDEX "User_organization_id_user_name_key" ON "User" ("organization_id", "user_name");
