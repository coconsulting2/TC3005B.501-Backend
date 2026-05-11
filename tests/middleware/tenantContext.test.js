/**
 * @file tests/middleware/tenantContext.test.js
 * @description Tests del middleware de tenant context + AsyncLocalStorage.
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const { tenantContextMiddleware, getTenantContext, withTenantContext } = await import(
  "../../middleware/tenantContext.js"
);

function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe("tenantContextMiddleware", () => {
  test("sin req.user pasa de largo (rutas públicas)", () => {
    const req = {};
    const res = makeRes();
    const next = jest.fn();
    tenantContextMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.tenant).toBeUndefined();
  });

  test("JWT sin organization_id: skip silencioso (RLS sigue cubriendo)", () => {
    // Compat con tokens legacy durante grace period y mock users de tests.
    // No bloquea — la defensa en profundidad es RLS de Postgres: sin SET LOCAL
    // del GUC `app.current_organization_id`, las queries retornan 0 filas.
    const req = { user: { user_id: 1 }, headers: {} };
    const res = makeRes();
    const next = jest.fn();
    tenantContextMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.tenant).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("setea req.tenant con organizationId del JWT", () => {
    const req = {
      user: { user_id: 5, organization_id: "42", organization_kind: "CLIENT" },
      headers: {},
    };
    const res = makeRes();
    const next = jest.fn(() => {
      // Dentro de next, el AsyncLocalStorage debe estar activo.
      const ctx = getTenantContext();
      expect(ctx?.organizationId).toBe(42n);
      expect(ctx?.userId).toBe(5);
      expect(ctx?.isRoot).toBe(false);
      expect(ctx?.bypassTenant).toBe(false);
    });
    tenantContextMiddleware(req, res, next);
    expect(req.tenant.organizationId).toBe(42n);
    expect(req.tenant.jwtOrgId).toBe(42n);
    expect(next).toHaveBeenCalled();
  });

  test("respeta X-Organization-Id solo para super-admin Ditta (ROOT)", () => {
    const req = {
      user: { user_id: 1, organization_id: "1", organization_kind: "ROOT" },
      headers: { "x-organization-id": "5" },
    };
    const res = makeRes();
    const next = jest.fn(() => {
      const ctx = getTenantContext();
      expect(ctx?.organizationId).toBe(5n);
      expect(ctx?.jwtOrgId).toBe(1n);
      expect(ctx?.isRoot).toBe(true);
      expect(ctx?.bypassTenant).toBe(true);
    });
    tenantContextMiddleware(req, res, next);
    expect(req.tenant.bypassTenant).toBe(true);
  });

  test("ignora X-Organization-Id si user NO es ROOT", () => {
    const req = {
      user: { user_id: 3, organization_id: "5", organization_kind: "CLIENT" },
      headers: { "x-organization-id": "999" },
    };
    const res = makeRes();
    const next = jest.fn(() => {
      const ctx = getTenantContext();
      // Sigue siendo 5 (su org), no 999.
      expect(ctx?.organizationId).toBe(5n);
      expect(ctx?.bypassTenant).toBe(false);
    });
    tenantContextMiddleware(req, res, next);
    expect(req.tenant.organizationId).toBe(5n);
  });
});

describe("withTenantContext", () => {
  test("ejecuta fn dentro del contexto y lo libera al salir", async () => {
    expect(getTenantContext()).toBeNull();

    const result = await withTenantContext({ organizationId: 7n, userId: 99, isRoot: false }, async () => {
      const ctx = getTenantContext();
      expect(ctx?.organizationId).toBe(7n);
      return "ok";
    });

    expect(result).toBe("ok");
    expect(getTenantContext()).toBeNull();
  });
});
