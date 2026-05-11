/**
 * @file tests/prisma/tenantExtension.test.js
 * @description Tests de la función pura `applyTenantScopingToArgs` que vive en la
 * Prisma Client Extension. Testeamos la lógica sin tocar Prisma (simular `defineExtension`
 * es frágil porque su shape interno cambia entre versiones).
 *
 * Verifica:
 *   - Sin tenantContext, no inyecta nada (jobs internos).
 *   - Con tenantContext, inyecta where.organizationId en find/count y delete/update.
 *   - Con tenantContext, inyecta data.organizationId en create/createMany.
 *   - Con bypass=true (super-admin Ditta cross-tenant), NO inyecta.
 *   - Modelo NO tenant-scoped (permission, country, etc.) no recibe inyección.
 *   - Si el caller ya pasa where.organizationId explícito, no se sobrescribe.
 */
import { describe, test, expect } from "@jest/globals";
import { TENANT_SCOPED_MODELS, applyTenantScopingToArgs } from "../../prisma/tenantExtension.js";

describe("TENANT_SCOPED_MODELS", () => {
  test("incluye los modelos clave", () => {
    expect(TENANT_SCOPED_MODELS.has("user")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("request")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("receipt")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("travelPolicy")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("permissionGroup")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("role")).toBe(true);
  });

  test("modelos globales NO están en la lista tenant-scoped", () => {
    expect(TENANT_SCOPED_MODELS.has("permission")).toBe(false);
    expect(TENANT_SCOPED_MODELS.has("requestStatus")).toBe(false);
    expect(TENANT_SCOPED_MODELS.has("country")).toBe(false);
    expect(TENANT_SCOPED_MODELS.has("city")).toBe(false);
    expect(TENANT_SCOPED_MODELS.has("organization")).toBe(false);
  });
});

describe("applyTenantScopingToArgs", () => {
  test("sin tenantContext: no inyecta where", () => {
    const out = applyTenantScopingToArgs({
      model: "request",
      operation: "findMany",
      args: { where: { active: true } },
      ctx: null,
    });
    expect(out.where.organizationId).toBeUndefined();
    expect(out.where.active).toBe(true);
  });

  test("con tenantContext: inyecta where.organizationId en findMany", () => {
    const out = applyTenantScopingToArgs({
      model: "request",
      operation: "findMany",
      args: { where: { active: true } },
      ctx: { orgId: 42n, bypassTenant: false },
    });
    expect(out.where.organizationId).toBe(42n);
    expect(out.where.active).toBe(true);
  });

  test("con tenantContext: inyecta where.organizationId en findUnique", () => {
    const out = applyTenantScopingToArgs({
      model: "user",
      operation: "findUnique",
      args: { where: { userId: 1 } },
      ctx: { orgId: 7n, bypassTenant: false },
    });
    expect(out.where.organizationId).toBe(7n);
  });

  test("con tenantContext: inyecta data.organizationId en create", () => {
    const out = applyTenantScopingToArgs({
      model: "request",
      operation: "create",
      args: { data: { notes: "test", userId: 5 } },
      ctx: { orgId: 7n, bypassTenant: false },
    });
    expect(out.data.organizationId).toBe(7n);
    expect(out.data.notes).toBe("test");
    expect(out.data.userId).toBe(5);
  });

  test("con tenantContext: inyecta organizationId a cada item en createMany", () => {
    const out = applyTenantScopingToArgs({
      model: "receipt",
      operation: "createMany",
      args: { data: [{ amount: 100 }, { amount: 200 }] },
      ctx: { orgId: 3n, bypassTenant: false },
    });
    expect(out.data[0].organizationId).toBe(3n);
    expect(out.data[1].organizationId).toBe(3n);
    expect(out.data[0].amount).toBe(100);
  });

  test("con bypassTenant=true: NO inyecta where ni data", () => {
    const out = applyTenantScopingToArgs({
      model: "request",
      operation: "findMany",
      args: { where: { active: true } },
      ctx: { orgId: 1n, bypassTenant: true },
    });
    expect(out.where.organizationId).toBeUndefined();
  });

  test("modelo NO tenant-scoped (permission): no inyecta nada", () => {
    const out = applyTenantScopingToArgs({
      model: "permission",
      operation: "findMany",
      args: { where: { active: true } },
      ctx: { orgId: 42n, bypassTenant: false },
    });
    expect(out.where.organizationId).toBeUndefined();
  });

  test("modelo NO tenant-scoped (country): no inyecta nada", () => {
    const out = applyTenantScopingToArgs({
      model: "country",
      operation: "findMany",
      args: {},
      ctx: { orgId: 42n, bypassTenant: false },
    });
    expect(out.where).toBeUndefined();
  });

  test("respeta where.organizationId explícito (no sobrescribe)", () => {
    const out = applyTenantScopingToArgs({
      model: "request",
      operation: "findMany",
      args: { where: { organizationId: 99n } },
      ctx: { orgId: 42n, bypassTenant: false },
    });
    expect(out.where.organizationId).toBe(99n);
  });

  test("update inyecta where.organizationId (defensa contra adivinar ids ajenos)", () => {
    const out = applyTenantScopingToArgs({
      model: "request",
      operation: "update",
      args: { where: { requestId: 5 }, data: { notes: "ok" } },
      ctx: { orgId: 42n, bypassTenant: false },
    });
    expect(out.where.organizationId).toBe(42n);
    expect(out.where.requestId).toBe(5);
  });

  test("delete inyecta where.organizationId", () => {
    const out = applyTenantScopingToArgs({
      model: "request",
      operation: "delete",
      args: { where: { requestId: 5 } },
      ctx: { orgId: 42n, bypassTenant: false },
    });
    expect(out.where.organizationId).toBe(42n);
  });

  test("upsert inyecta where + create.organizationId", () => {
    const out = applyTenantScopingToArgs({
      model: "receiptType",
      operation: "upsert",
      args: {
        where: { receiptTypeId: 1 },
        create: { receiptTypeName: "Hotel" },
        update: { receiptTypeName: "Hospedaje" },
      },
      ctx: { orgId: 8n, bypassTenant: false },
    });
    expect(out.where.organizationId).toBe(8n);
    expect(out.create.organizationId).toBe(8n);
    expect(out.create.receiptTypeName).toBe("Hotel");
  });
});
