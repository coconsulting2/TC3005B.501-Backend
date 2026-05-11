-- =====================================================================
-- Migration: multi_tenant_baseline
-- Plan: refactored-hugging-flask.md (multi-tenant con Ditta como ROOT)
--
-- Cambios:
--   1. Adopta tabla `organizaciones` preexistente como modelo Prisma `Organization`.
--   2. Agrega `organization_id` NOT NULL a TODOS los modelos operativos y catálogos editables.
--   3. Renombra `org_id` a `organization_id` lógicamente vía @map (la columna física se mantiene
--      como `org_id` en M2-004/006 para evitar tocar code legacy; el resto usa `organization_id`).
--   4. Crea tablas nuevas: approval_substitutes (formal), chart_of_accounts, accounting_doc_types,
--      accounting_societies, organization_integrations, notification_templates.
--   5. Habilita Row-Level Security en TODAS las tablas tenant-scoped.
--   6. Crea rol Postgres `migrator` con BYPASSRLS para migrations y seed scripts.
--   7. Datos: bootstrappea Ditta como ROOT (id=1) y asigna data existente a TechCorp (id=2)
--      como fallback de dev. En producción, antes de aplicar esta migration, ejecutar el
--      script de auditoría `scripts/auditTenantBackfill.js` para verificar 0 huérfanos.
-- =====================================================================

-- ===================== Bloque 1: roles Postgres ======================

-- migrator: rol con BYPASSRLS para correr migrations y seeds.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') THEN
    CREATE ROLE migrator;
  END IF;
  ALTER ROLE migrator BYPASSRLS;
END
$$;

GRANT USAGE ON SCHEMA public TO migrator;
GRANT ALL ON ALL TABLES IN SCHEMA public TO migrator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO migrator;

-- ===================== Bloque 2: tabla organizaciones ================

-- Si la tabla NO existe (entorno limpio), la creamos.
CREATE TABLE IF NOT EXISTS "organizaciones" (
  "id" BIGSERIAL PRIMARY KEY,
  "nombre" VARCHAR(100) NOT NULL DEFAULT 'Sin nombre',
  "razon_social" VARCHAR(200),
  "rfc" VARCHAR(13),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);

-- Idempotente: agrega las columnas multi-tenant nuevas si no existen.
ALTER TABLE "organizaciones"
  ADD COLUMN IF NOT EXISTS "logo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "timezone" VARCHAR(60) NOT NULL DEFAULT 'America/Mexico_City',
  ADD COLUMN IF NOT EXISTS "base_currency" VARCHAR(3) NOT NULL DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS "kind" VARCHAR(20) NOT NULL DEFAULT 'CLIENT',
  ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

-- RFC vuelve opcional (drop NOT NULL si estaba).
ALTER TABLE "organizaciones" ALTER COLUMN "rfc" DROP NOT NULL;

-- Quitar índice unique simple de RFC si existe; reemplazarlo por unique parcial.
DROP INDEX IF EXISTS "organizaciones_rfc_key";
CREATE UNIQUE INDEX IF NOT EXISTS "organizaciones_rfc_unique"
  ON "organizaciones" ("rfc") WHERE "rfc" IS NOT NULL;

-- Constraint: solo puede existir UNA org con kind=ROOT (Ditta).
CREATE UNIQUE INDEX IF NOT EXISTS "organizaciones_one_root"
  ON "organizaciones" ("kind") WHERE "kind" = 'ROOT';

-- Bootstrap idempotente de Ditta (id=1) y TechCorp/Logística (id 2,3 fallback).
-- Las inserciones se hacen sin RLS (la tabla no tiene RLS) y antes de aplicar políticas en otras tablas.
INSERT INTO "organizaciones" ("id", "nombre", "razon_social", "rfc", "kind", "status")
VALUES (1, 'Ditta', NULL, NULL, 'ROOT', 'ACTIVE')
ON CONFLICT ("id") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "kind" = 'ROOT',
  "status" = 'ACTIVE';

INSERT INTO "organizaciones" ("id", "nombre", "razon_social", "rfc", "kind", "status")
VALUES (2, 'TechCorp México SA de CV', 'TechCorp México Sociedad Anónima de Capital Variable', 'XAXX010101000', 'CLIENT', 'ACTIVE')
ON CONFLICT ("id") DO UPDATE SET "kind" = 'CLIENT';

INSERT INTO "organizaciones" ("id", "nombre", "razon_social", "rfc", "kind", "status")
VALUES (3, 'Logística del Norte SA de CV', 'Logística del Norte Sociedad Anónima de Capital Variable', 'XEXX010101000', 'CLIENT', 'ACTIVE')
ON CONFLICT ("id") DO UPDATE SET "kind" = 'CLIENT';

-- Asegurar que la secuencia avance más allá de los IDs reservados.
SELECT setval(pg_get_serial_sequence('organizaciones', 'id'), GREATEST(3, (SELECT COALESCE(MAX(id), 0) FROM organizaciones)));

-- ===================== Bloque 3: ALTER TABLES tenant-scope ===========

-- User: org_id -> organization_id, hacer NOT NULL con fallback TechCorp.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "User" SET "organization_id" = COALESCE("org_id", 2) WHERE "organization_id" IS NULL;

ALTER TABLE "User"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "User_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id");

-- Drop org_id legacy si existe (data migrada arriba).
ALTER TABLE "User" DROP COLUMN IF EXISTS "org_id";

CREATE INDEX IF NOT EXISTS "User_organization_id_active_idx" ON "User" ("organization_id", "active");

-- Role: per-org. Backfill duplicando roles por org existente.
-- Estrategia: para cada org, clonar los roles globales y re-mapear users.role_id.
ALTER TABLE "Role"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false;

-- Drop unique role_name (era global, ahora es per-org).
ALTER TABLE "Role" DROP CONSTRAINT IF EXISTS "Role_role_name_key";
DROP INDEX IF EXISTS "Role_role_name_key";

-- Permitir role_name más largo.
ALTER TABLE "Role" ALTER COLUMN "role_name" TYPE VARCHAR(40);

-- Backfill: si hay roles sin organization_id, asignarlos a Ditta (id=1) y marcarlos is_system.
UPDATE "Role" SET "organization_id" = 1, "is_system" = true WHERE "organization_id" IS NULL;

ALTER TABLE "Role"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "Role_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "Role_organization_id_role_name_key" ON "Role" ("organization_id", "role_name");
CREATE INDEX IF NOT EXISTS "Role_organization_id_idx" ON "Role" ("organization_id");

-- Department: per-org.
ALTER TABLE "Department"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "Department" SET "organization_id" = 2 WHERE "organization_id" IS NULL;

ALTER TABLE "Department"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "Department_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

ALTER TABLE "Department" ALTER COLUMN "department_name" TYPE VARCHAR(60);
ALTER TABLE "Department" DROP CONSTRAINT IF EXISTS "Department_department_name_key";
DROP INDEX IF EXISTS "Department_department_name_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Department_organization_id_department_name_key" ON "Department" ("organization_id", "department_name");
CREATE INDEX IF NOT EXISTS "Department_organization_id_active_idx" ON "Department" ("organization_id", "active");

-- AlertMessage: per-org.
ALTER TABLE "AlertMessage"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false;

UPDATE "AlertMessage" SET "organization_id" = 1, "is_system" = true WHERE "organization_id" IS NULL;

ALTER TABLE "AlertMessage"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "AlertMessage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

ALTER TABLE "AlertMessage" ALTER COLUMN "message_text" TYPE VARCHAR(255);

CREATE INDEX IF NOT EXISTS "AlertMessage_organization_id_idx" ON "AlertMessage" ("organization_id");

-- ReceiptType: per-org.
ALTER TABLE "Receipt_Type"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Receipt_Type" SET "organization_id" = 1, "is_system" = true WHERE "organization_id" IS NULL;

ALTER TABLE "Receipt_Type"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "Receipt_Type_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

ALTER TABLE "Receipt_Type" ALTER COLUMN "receipt_type_name" TYPE VARCHAR(40);
ALTER TABLE "Receipt_Type" DROP CONSTRAINT IF EXISTS "Receipt_Type_receipt_type_name_key";
DROP INDEX IF EXISTS "Receipt_Type_receipt_type_name_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_Type_organization_id_receipt_type_name_key" ON "Receipt_Type" ("organization_id", "receipt_type_name");
CREATE INDEX IF NOT EXISTS "Receipt_Type_organization_id_idx" ON "Receipt_Type" ("organization_id");

-- Request: per-org (derivado de user).
ALTER TABLE "Request"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "Request" r SET "organization_id" = COALESCE(
  (SELECT u."organization_id" FROM "User" u WHERE u."user_id" = r."user_id"),
  2
) WHERE r."organization_id" IS NULL;

ALTER TABLE "Request"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "Request_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id");

CREATE INDEX IF NOT EXISTS "Request_organization_id_request_status_id_idx" ON "Request" ("organization_id", "request_status_id");

-- SolicitudHistorial: per-org (derivado de request).
ALTER TABLE "solicitud_historial"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "solicitud_historial" h SET "organization_id" = (
  SELECT r."organization_id" FROM "Request" r WHERE r."request_id" = h."request_id"
) WHERE h."organization_id" IS NULL;

UPDATE "solicitud_historial" SET "organization_id" = 2 WHERE "organization_id" IS NULL;

ALTER TABLE "solicitud_historial"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "solicitud_historial_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "solicitud_historial_organization_id_created_at_idx" ON "solicitud_historial" ("organization_id", "created_at" DESC);

-- Alert: per-org (derivado de request).
ALTER TABLE "Alert"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "Alert" a SET "organization_id" = (
  SELECT r."organization_id" FROM "Request" r WHERE r."request_id" = a."request_id"
) WHERE a."organization_id" IS NULL;

UPDATE "Alert" SET "organization_id" = 2 WHERE "organization_id" IS NULL;

ALTER TABLE "Alert"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "Alert_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "Alert_organization_id_idx" ON "Alert" ("organization_id");

-- Route: per-org (derivado de route_request → request → user).
ALTER TABLE "Route"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "Route" rt SET "organization_id" = COALESCE(
  (SELECT r."organization_id" FROM "Route_Request" rr JOIN "Request" r ON rr."request_id" = r."request_id" WHERE rr."route_id" = rt."route_id" LIMIT 1),
  2
) WHERE rt."organization_id" IS NULL;

ALTER TABLE "Route"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "Route_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id");

CREATE INDEX IF NOT EXISTS "Route_organization_id_idx" ON "Route" ("organization_id");

-- RouteRequest: per-org.
ALTER TABLE "Route_Request"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "Route_Request" rr SET "organization_id" = COALESCE(
  (SELECT r."organization_id" FROM "Request" r WHERE r."request_id" = rr."request_id"),
  2
) WHERE rr."organization_id" IS NULL;

ALTER TABLE "Route_Request"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "Route_Request_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "Route_Request_organization_id_idx" ON "Route_Request" ("organization_id");

-- Receipt: per-org (derivado de request).
ALTER TABLE "Receipt"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "Receipt" rc SET "organization_id" = COALESCE(
  (SELECT r."organization_id" FROM "Request" r WHERE r."request_id" = rc."request_id"),
  2
) WHERE rc."organization_id" IS NULL;

ALTER TABLE "Receipt"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "Receipt_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id");

CREATE INDEX IF NOT EXISTS "Receipt_organization_id_validation_idx" ON "Receipt" ("organization_id", "validation");

-- CfdiComprobante: per-org (derivado de receipt).
ALTER TABLE "cfdi_comprobantes"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "cfdi_comprobantes" c SET "organization_id" = (
  SELECT rc."organization_id" FROM "Receipt" rc WHERE rc."receipt_id" = c."receipt_id"
) WHERE c."organization_id" IS NULL;

UPDATE "cfdi_comprobantes" SET "organization_id" = 2 WHERE "organization_id" IS NULL;

ALTER TABLE "cfdi_comprobantes"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "cfdi_comprobantes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id");

CREATE INDEX IF NOT EXISTS "cfdi_comprobantes_organization_id_idx" ON "cfdi_comprobantes" ("organization_id");

-- GastoTramo: per-org (derivado de request).
ALTER TABLE "gasto_tramo"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "gasto_tramo" g SET "organization_id" = COALESCE(
  (SELECT r."organization_id" FROM "Request" r WHERE r."request_id" = g."viaje_id"),
  2
) WHERE g."organization_id" IS NULL;

ALTER TABLE "gasto_tramo"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "gasto_tramo_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id");

CREATE INDEX IF NOT EXISTS "gasto_tramo_organization_id_idx" ON "gasto_tramo" ("organization_id");

-- Notification: per-org (derivado de user).
ALTER TABLE "notification"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "notification" n SET "organization_id" = (
  SELECT u."organization_id" FROM "User" u WHERE u."user_id" = n."user_id"
) WHERE n."organization_id" IS NULL;

ALTER TABLE "notification"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "notification_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "notification_organization_id_is_read_idx" ON "notification" ("organization_id", "is_read");

-- UserPreference: per-org (derivado de user).
ALTER TABLE "user_preference"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "user_preference" p SET "organization_id" = (
  SELECT u."organization_id" FROM "User" u WHERE u."user_id" = p."user_id"
) WHERE p."organization_id" IS NULL;

ALTER TABLE "user_preference"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "user_preference_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

-- PushSubscription: per-org (derivado de user).
ALTER TABLE "push_subscription"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "push_subscription" p SET "organization_id" = (
  SELECT u."organization_id" FROM "User" u WHERE u."user_id" = p."user_id"
) WHERE p."organization_id" IS NULL;

ALTER TABLE "push_subscription"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "push_subscription_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

-- PolicyException: per-org (derivado de request).
ALTER TABLE "policy_exception"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "policy_exception" pe SET "organization_id" = (
  SELECT r."organization_id" FROM "Request" r WHERE r."request_id" = pe."request_id"
) WHERE pe."organization_id" IS NULL;

UPDATE "policy_exception" SET "organization_id" = 2 WHERE "organization_id" IS NULL;

ALTER TABLE "policy_exception"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "policy_exception_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "policy_exception_organization_id_idx" ON "policy_exception" ("organization_id");

-- M2-006 already has org_id column. Just add FK if missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'employee_category_org_id_fkey') THEN
    ALTER TABLE "employee_category" ADD CONSTRAINT "employee_category_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'travel_policy_org_id_fkey') THEN
    ALTER TABLE "travel_policy" ADD CONSTRAINT "travel_policy_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'reimbursement_time_limit_org_id_fkey') THEN
    ALTER TABLE "reimbursement_time_limit" ADD CONSTRAINT "reimbursement_time_limit_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'workflow_rules_org_id_fkey') THEN
    ALTER TABLE "workflow_rules" ADD CONSTRAINT "workflow_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'api_keys_org_id_fkey') THEN
    ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;
  END IF;
END
$$;

-- ===================== Bloque 4: PermissionGroup per-org ==============

-- PermissionGroup: agregar organization_id + is_system + unique compuesto.
ALTER TABLE "PermissionGroup"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false;

UPDATE "PermissionGroup" SET "organization_id" = 1, "is_system" = true WHERE "organization_id" IS NULL;

ALTER TABLE "PermissionGroup"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "PermissionGroup_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

ALTER TABLE "PermissionGroup" DROP CONSTRAINT IF EXISTS "PermissionGroup_group_name_key";
DROP INDEX IF EXISTS "PermissionGroup_group_name_key";

CREATE UNIQUE INDEX IF NOT EXISTS "PermissionGroup_organization_id_group_name_key" ON "PermissionGroup" ("organization_id", "group_name");
CREATE INDEX IF NOT EXISTS "PermissionGroup_organization_id_active_idx" ON "PermissionGroup" ("organization_id", "active");

-- UserPermission y UserPermissionGroup: per-org (derivado de user).
ALTER TABLE "User_Permission"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "User_Permission" up SET "organization_id" = (
  SELECT u."organization_id" FROM "User" u WHERE u."user_id" = up."user_id"
) WHERE up."organization_id" IS NULL;

ALTER TABLE "User_Permission"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "User_Permission_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "User_Permission_organization_id_idx" ON "User_Permission" ("organization_id");

ALTER TABLE "User_Permission_Group"
  ADD COLUMN IF NOT EXISTS "organization_id" BIGINT;

UPDATE "User_Permission_Group" upg SET "organization_id" = (
  SELECT u."organization_id" FROM "User" u WHERE u."user_id" = upg."user_id"
) WHERE upg."organization_id" IS NULL;

ALTER TABLE "User_Permission_Group"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "User_Permission_Group_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "User_Permission_Group_organization_id_idx" ON "User_Permission_Group" ("organization_id");

-- ===================== Bloque 5: tablas nuevas =======================

CREATE TABLE IF NOT EXISTS "proveedores" (
  "proveedor_id"  BIGSERIAL PRIMARY KEY,
  "org_id"        BIGINT NOT NULL,
  "nombre"        VARCHAR(100) NOT NULL,
  "razon_social"  VARCHAR(200),
  "rfc"           VARCHAR(13),
  "email"         VARCHAR(254),
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "created_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "proveedores_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE,
  CONSTRAINT "proveedores_org_nombre_key" UNIQUE ("org_id", "nombre")
);

CREATE INDEX IF NOT EXISTS "proveedores_org_id_active_idx" ON "proveedores" ("org_id", "active");

-- approval_substitutes (formal Prisma table; reemplaza raw SQL legacy si existía).
CREATE TABLE IF NOT EXISTS "approval_substitutes" (
  "substitute_id"    BIGSERIAL PRIMARY KEY,
  "organization_id"  BIGINT NOT NULL,
  "primary_user_id"  INT NOT NULL,
  "backup_user_id"   INT NOT NULL,
  "effective_from"   DATE NOT NULL,
  "effective_to"     DATE,
  "reason"           TEXT,
  "active"           BOOLEAN NOT NULL DEFAULT true,
  "created_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "approval_substitutes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE,
  CONSTRAINT "approval_substitutes_primary_user_id_fkey" FOREIGN KEY ("primary_user_id") REFERENCES "User"("user_id"),
  CONSTRAINT "approval_substitutes_backup_user_id_fkey"  FOREIGN KEY ("backup_user_id")  REFERENCES "User"("user_id")
);

CREATE INDEX IF NOT EXISTS "approval_substitutes_org_primary_idx" ON "approval_substitutes" ("organization_id", "primary_user_id", "active");

-- chart_of_accounts (RF-74).
CREATE TABLE IF NOT EXISTS "chart_of_accounts" (
  "account_id"        BIGSERIAL PRIMARY KEY,
  "organization_id"   BIGINT NOT NULL,
  "account_code"      VARCHAR(40) NOT NULL,
  "account_name"      VARCHAR(200) NOT NULL,
  "account_type"      VARCHAR(40) NOT NULL,
  "parent_account_id" BIGINT,
  "active"            BOOLEAN NOT NULL DEFAULT true,
  "is_system"         BOOLEAN NOT NULL DEFAULT false,
  "created_at"        TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "chart_of_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE,
  CONSTRAINT "chart_of_accounts_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "chart_of_accounts"("account_id"),
  CONSTRAINT "chart_of_accounts_org_code_key" UNIQUE ("organization_id", "account_code")
);

CREATE INDEX IF NOT EXISTS "chart_of_accounts_organization_id_active_idx" ON "chart_of_accounts" ("organization_id", "active");

CREATE TABLE IF NOT EXISTS "accounting_doc_types" (
  "doc_type_id"     BIGSERIAL PRIMARY KEY,
  "organization_id" BIGINT NOT NULL,
  "code"            VARCHAR(10) NOT NULL,
  "name"            VARCHAR(120) NOT NULL,
  "is_system"       BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "accounting_doc_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE,
  CONSTRAINT "accounting_doc_types_org_code_key" UNIQUE ("organization_id", "code")
);

CREATE TABLE IF NOT EXISTS "accounting_societies" (
  "society_id"      BIGSERIAL PRIMARY KEY,
  "organization_id" BIGINT NOT NULL,
  "code"            VARCHAR(10) NOT NULL,
  "name"            VARCHAR(120) NOT NULL,
  "is_system"       BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "accounting_societies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE,
  CONSTRAINT "accounting_societies_org_code_key" UNIQUE ("organization_id", "code")
);

-- organization_integrations.
CREATE TABLE IF NOT EXISTS "organization_integrations" (
  "integration_id"  BIGSERIAL PRIMARY KEY,
  "organization_id" BIGINT NOT NULL,
  "provider"        VARCHAR(40) NOT NULL,
  "config"          TEXT NOT NULL,
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_by_id"   INT,
  CONSTRAINT "organization_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE,
  CONSTRAINT "organization_integrations_provider_check" CHECK ("provider" IN ('SMTP','WISE','SAT','BANXICO','VAPID')),
  CONSTRAINT "organization_integrations_org_provider_key" UNIQUE ("organization_id", "provider")
);

CREATE INDEX IF NOT EXISTS "organization_integrations_organization_id_active_idx" ON "organization_integrations" ("organization_id", "active");

-- notification_templates.
CREATE TABLE IF NOT EXISTS "notification_templates" (
  "template_id"     BIGSERIAL PRIMARY KEY,
  "organization_id" BIGINT NOT NULL,
  "code"            VARCHAR(60) NOT NULL,
  "channel"         VARCHAR(10) NOT NULL,
  "subject"         VARCHAR(254),
  "body"            TEXT NOT NULL,
  "locale"          VARCHAR(10) NOT NULL DEFAULT 'es-MX',
  "is_system"       BOOLEAN NOT NULL DEFAULT false,
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "notification_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE,
  CONSTRAINT "notification_templates_channel_check" CHECK ("channel" IN ('EMAIL','PUSH','INAPP')),
  CONSTRAINT "notification_templates_org_code_channel_locale_key" UNIQUE ("organization_id", "code", "channel", "locale")
);

CREATE INDEX IF NOT EXISTS "notification_templates_organization_id_active_idx" ON "notification_templates" ("organization_id", "active");

-- ===================== Bloque 6: Row-Level Security ===================

-- Enable RLS en todas las tablas tenant-scoped. La política valida que
-- current_setting('app.current_organization_id') coincida con la columna,
-- o que current_setting('app.bypass_tenant') sea 'on' (super-admin Ditta).

DO $$
DECLARE
  t TEXT;
  org_col TEXT;
BEGIN
  FOR t, org_col IN
    SELECT * FROM (VALUES
      ('User',                    'organization_id'),
      ('Department',              'organization_id'),
      ('Role',                    'organization_id'),
      ('AlertMessage',            'organization_id'),
      ('Receipt_Type',            'organization_id'),
      ('Request',                 'organization_id'),
      ('solicitud_historial',     'organization_id'),
      ('Alert',                   'organization_id'),
      ('Route',                   'organization_id'),
      ('Route_Request',           'organization_id'),
      ('Receipt',                 'organization_id'),
      ('cfdi_comprobantes',       'organization_id'),
      ('gasto_tramo',             'organization_id'),
      ('notification',            'organization_id'),
      ('user_preference',         'organization_id'),
      ('push_subscription',       'organization_id'),
      ('PermissionGroup',         'organization_id'),
      ('User_Permission',         'organization_id'),
      ('User_Permission_Group',   'organization_id'),
      ('employee_category',       'org_id'),
      ('travel_policy',           'org_id'),
      ('reimbursement_time_limit','org_id'),
      ('workflow_rules',          'org_id'),
      ('policy_exception',        'organization_id'),
      ('proveedores',             'org_id'),
      ('approval_substitutes',    'organization_id'),
      ('chart_of_accounts',       'organization_id'),
      ('accounting_doc_types',    'organization_id'),
      ('accounting_societies',    'organization_id'),
      ('organization_integrations','organization_id'),
      ('notification_templates',  'organization_id'),
      ('api_keys',                 'org_id')
    ) AS x(t, org_col)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (' ||
      '  %I = NULLIF(current_setting(''app.current_organization_id'', true), '''')::bigint' ||
      '  OR current_setting(''app.bypass_tenant'', true) = ''on'')' ||
      ' WITH CHECK (' ||
      '  %I = NULLIF(current_setting(''app.current_organization_id'', true), '''')::bigint' ||
      '  OR current_setting(''app.bypass_tenant'', true) = ''on'')',
      t, org_col, org_col
    );
  END LOOP;
END
$$;

-- Tablas que heredan scope vía padre (sin org_id directo): política JOIN-based.
ALTER TABLE "Permission_Group_Item" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_via_group ON "Permission_Group_Item";
CREATE POLICY tenant_isolation_via_group ON "Permission_Group_Item"
  USING (
    current_setting('app.bypass_tenant', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "PermissionGroup" pg
      WHERE pg."group_id" = "Permission_Group_Item"."group_id"
      AND pg."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::bigint
    )
  )
  WITH CHECK (
    current_setting('app.bypass_tenant', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "PermissionGroup" pg
      WHERE pg."group_id" = "Permission_Group_Item"."group_id"
      AND pg."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::bigint
    )
  );

ALTER TABLE "Role_Permission" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_via_role ON "Role_Permission";
CREATE POLICY tenant_isolation_via_role ON "Role_Permission"
  USING (
    current_setting('app.bypass_tenant', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Role" r
      WHERE r."role_id" = "Role_Permission"."role_id"
      AND r."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::bigint
    )
  )
  WITH CHECK (
    current_setting('app.bypass_tenant', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Role" r
      WHERE r."role_id" = "Role_Permission"."role_id"
      AND r."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::bigint
    )
  );

ALTER TABLE "Role_Permission_Group" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_via_role ON "Role_Permission_Group";
CREATE POLICY tenant_isolation_via_role ON "Role_Permission_Group"
  USING (
    current_setting('app.bypass_tenant', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Role" r
      WHERE r."role_id" = "Role_Permission_Group"."role_id"
      AND r."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::bigint
    )
  )
  WITH CHECK (
    current_setting('app.bypass_tenant', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Role" r
      WHERE r."role_id" = "Role_Permission_Group"."role_id"
      AND r."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::bigint
    )
  );

ALTER TABLE "api_key_logs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_via_api_key ON "api_key_logs";
CREATE POLICY tenant_isolation_via_api_key ON "api_key_logs"
  USING (
    current_setting('app.bypass_tenant', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "api_keys" ak
      WHERE ak."id" = "api_key_logs"."key_id"
      AND ak."org_id" = NULLIF(current_setting('app.current_organization_id', true), '')::bigint
    )
  )
  WITH CHECK (
    current_setting('app.bypass_tenant', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "api_keys" ak
      WHERE ak."id" = "api_key_logs"."key_id"
      AND ak."org_id" = NULLIF(current_setting('app.current_organization_id', true), '')::bigint
    )
  );

ALTER TABLE "policy_expense_cap" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_via_policy ON "policy_expense_cap";
CREATE POLICY tenant_isolation_via_policy ON "policy_expense_cap"
  USING (
    current_setting('app.bypass_tenant', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "travel_policy" tp
      WHERE tp."policy_id" = "policy_expense_cap"."policy_id"
      AND tp."org_id" = NULLIF(current_setting('app.current_organization_id', true), '')::bigint
    )
  )
  WITH CHECK (
    current_setting('app.bypass_tenant', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "travel_policy" tp
      WHERE tp."policy_id" = "policy_expense_cap"."policy_id"
      AND tp."org_id" = NULLIF(current_setting('app.current_organization_id', true), '')::bigint
    )
  );

-- organizaciones tabla: NO recibe RLS (Ditta debe poder listar todas).
-- Permission, Request_status, Country, City: catálogos GLOBALES, sin RLS.

-- Final: comentario de auditoría.
COMMENT ON TABLE "organizaciones" IS 'Tenants. Ditta es kind=ROOT. Resto kind=CLIENT. Sin RLS porque Ditta debe ver todas.';
