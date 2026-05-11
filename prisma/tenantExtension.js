/**
 * @module prisma/tenantExtension
 * @description Prisma Client Extension que aplica tenant scoping automático.
 *
 *   1. Antes de cada operación, ejecuta `SELECT set_config('app.current_organization_id', $orgId, true)`
 *      como GUC transaction-local para activar las políticas RLS de Postgres.
 *      Si el contexto es bypass (super-admin Ditta cross-org), también
 *      `set_config('app.bypass_tenant', 'on', true)`.
 *   2. Inyecta `where.organizationId = ctx.organizationId` en find/count/aggregate/update/delete
 *      de los modelos tenant-scoped (lista cerrada).
 *   3. Inyecta `data.organizationId = ctx.organizationId` en create/upsert.
 *   4. Si no hay tenantContext activo, NO inyecta nada — el llamador es responsable
 *      (server-internal jobs, seeds, etc., deben usar withTenantContext explícito).
 *
 * Lista de modelos tenant-scoped sincronizada con schema.prisma.
 * La columna física es `organization_id` para todos los modelos nuevos, y `org_id`
 * para los modelos legacy M2-006 (EmployeeCategory, TravelPolicy, ReimbursementTimeLimit,
 * WorkflowRule, Proveedor) — Prisma client expone `organizationId` en ambos.
 */
import { Prisma } from "@prisma/client";
import { getTenantContext } from "../middleware/tenantContext.js";

/**
 * Modelos que tienen `organizationId` directo (Prisma client field).
 * El nombre del modelo aquí es el delegate name (camelCase, plural).
 */
export const TENANT_SCOPED_MODELS = new Set([
  "user", "department", "role", "alertMessage", "receiptType",
  "request", "solicitudHistorial", "alert", "route", "routeRequest",
  "receipt", "cfdiComprobante", "gastoTramo",
  "notification", "userPreference", "pushSubscription",
  "permissionGroup", "userPermission", "userPermissionGroup",
  "employeeCategory", "travelPolicy", "reimbursementTimeLimit", "workflowRule",
  "policyException", "proveedor", "approvalSubstitute",
  "chartOfAccount", "accountingDocType", "accountingSociety",
  "organizationIntegration", "notificationTemplate",
  "apiKey",
]);

/** Operaciones de lectura: filtran por orgId en where. */
const READ_OPS = new Set([
  "findUnique", "findUniqueOrThrow",
  "findFirst", "findFirstOrThrow",
  "findMany", "count", "aggregate", "groupBy",
]);

/** Operaciones de mutación: filtran where + setean data.organizationId. */
const WRITE_OPS = new Set([
  "create", "createMany", "upsert",
  "update", "updateMany", "delete", "deleteMany",
]);

/**
 * Lógica pura de inyección. Recibe el contexto del tenant y los args originales
 * de la operación Prisma, retorna los args con organizationId inyectado donde corresponda.
 *
 * @param {object} params
 * @param {string} params.model         - Delegate name camelCase (e.g. "request", "user").
 * @param {string} params.operation     - Operación Prisma (e.g. "findMany", "create").
 * @param {any}    params.args          - Args originales de la operación.
 * @param {{orgId: bigint, bypassTenant?: boolean}|null} params.ctx - Tenant context o null.
 * @returns {any} Args modificados (o los mismos si no hay scope).
 */
export function applyTenantScopingToArgs({ model, operation, args, ctx }) {
  if (!ctx) return args;
  if (ctx.bypassTenant) return args;
  if (!TENANT_SCOPED_MODELS.has(model)) return args;

  const orgId = ctx.organizationId;

  if (READ_OPS.has(operation)) {
    return injectWhere(args, "organizationId", orgId);
  }
  if (operation === "create") {
    return ensureCreateOrgId(args, orgId);
  }
  if (operation === "createMany") {
    return ensureCreateManyOrgId(args, orgId);
  }
  if (operation === "upsert") {
    args = injectWhere(args, "organizationId", orgId);
    if (args.create && args.create.organizationId === undefined) {
      args.create = { organizationId: orgId, ...args.create };
    }
    return args;
  }
  if (operation === "update" || operation === "delete" || operation === "updateMany" || operation === "deleteMany") {
    return injectWhere(args, "organizationId", orgId);
  }

  return args;
}

/**
 * @returns {ReturnType<typeof Prisma.defineExtension>}
 */
export const tenantExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: "cocoscheme-tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelDelegate = model.charAt(0).toLowerCase() + model.slice(1);
          const ctx = getTenantContext();
          const scopedArgs = applyTenantScopingToArgs({ model: modelDelegate, operation, args, ctx });
          return query(scopedArgs);
        },
      },
    },
  })
);

function injectWhere(args, key, value) {
  args = args ?? {};
  const where = args.where ?? {};
  if (where[key] === undefined) {
    args.where = { ...where, [key]: value };
  }
  return args;
}

function ensureCreateOrgId(args, orgId) {
  args = args ?? {};
  const data = args.data ?? {};
  if (data.organizationId === undefined) {
    args.data = { organizationId: orgId, ...data };
  }
  return args;
}

function ensureCreateManyOrgId(args, orgId) {
  args = args ?? {};
  const data = args.data;
  if (Array.isArray(data)) {
    args.data = data.map((d) => (d.organizationId === undefined ? { organizationId: orgId, ...d } : d));
  } else if (data && typeof data === "object" && data.organizationId === undefined) {
    args.data = { organizationId: orgId, ...data };
  }
  return args;
}
