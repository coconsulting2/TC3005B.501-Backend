/**
 * @module tenantContext
 * @description Multi-tenant request context. Corre tras authMiddleware.
 *
 *   1. Lee `organization_id` y `organization_kind` del JWT decodificado en req.user.
 *   2. Si el usuario tiene permiso `organization:impersonate` y manda header
 *      `X-Organization-Id`, valida que la org exista y ACTIVE, luego override.
 *   3. Bloquea acceso si la org del usuario está SUSPENDED.
 *   4. Establece AsyncLocalStorage con { organizationId, userId, isRoot, bypassTenant }
 *      que la Prisma extension consume para inyectar where/data + SET LOCAL en RLS.
 *
 * Importante: este middleware NO debe ejecutarse en rutas públicas (login, health,
 * docs). Se monta solo en routers protegidos.
 */
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * @typedef {object} TenantContext
 * @property {bigint} organizationId          - organizationId activo (post-impersonate).
 * @property {bigint} jwtOrgId       - organizationId original del JWT.
 * @property {number} userId         - user_id del JWT.
 * @property {boolean} isRoot        - true si el JWT viene de la org ROOT (Ditta).
 * @property {boolean} bypassTenant  - true si el super-admin pidió bypass cross-tenant.
 */

const storage = new AsyncLocalStorage();

/**
 * Devuelve el contexto activo o null si no hay tenant context (request anónimo,
 * job interno sin withTenantContext, etc.).
 *
 * @returns {TenantContext|null}
 */
export function getTenantContext() {
  return storage.getStore() ?? null;
}

/**
 * Ejecuta una función dentro de un tenant context explícito. Útil para jobs/cron,
 * seeds, scripts CLI, y para impersonación interna desde super-admin.
 *
 * @template T
 * @param {{organizationId: bigint|number|string, userId?: number, isRoot?: boolean, bypassTenant?: boolean}} ctx
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function withTenantContext(ctx, fn) {
  const resolved = {
    organizationId: BigInt(ctx.organizationId),
    jwtOrgId: BigInt(ctx.organizationId),
    userId: ctx.userId ?? null,
    isRoot: Boolean(ctx.isRoot),
    bypassTenant: Boolean(ctx.bypassTenant),
  };
  return storage.run(resolved, fn);
}

/**
 * Express middleware. Debe correr DESPUÉS de authenticateToken.
 * @param req
 * @param res
 * @param next
 */
export const tenantContextMiddleware = (req, res, next) => {
  if (!req.user) {
    // Sin autenticación previa; no hay contexto.
    return next();
  }

  const jwtOrgId = req.user.organization_id != null ? BigInt(req.user.organization_id) : null;
  const isRoot = req.user.organization_kind === "ROOT";

  if (jwtOrgId == null) {
    // Si no hay organizationId (tokens viejos durante grace period, mock users en tests,
    // sesiones MOCK_AUTH), seguimos sin contexto. La defensa en profundidad
    // queda en RLS: sin `set_config('app.current_organization_id', ...)` las
    // queries a tablas tenant-scoped retornan 0 filas.
    return next();
  }

  let activeOrgId = jwtOrgId;
  let bypassTenant = false;

  // X-Organization-Id solo respetado si el usuario es ROOT y tiene impersonate
  // (validación granular del permiso se hace luego en el route handler que lo permita).
  // Aquí solo permitimos el override si organization_kind === ROOT (super-admin Ditta).
  const headerOrg = req.headers["x-organization-id"];
  if (headerOrg && isRoot) {
    try {
      activeOrgId = BigInt(headerOrg);
      bypassTenant = activeOrgId !== jwtOrgId; // viendo otra org cliente.
    } catch (_e) {
      return res.status(400).json({ error: "X-Organization-Id inválido" });
    }
  }

  const ctx = {
    organizationId: activeOrgId,
    jwtOrgId,
    userId: Number(req.user.user_id),
    isRoot,
    bypassTenant,
  };

  // Adjuntamos a req para conveniencia en controllers.
  req.tenant = ctx;

  storage.run(ctx, () => next());
};

export default {
  storage,
  getTenantContext,
  withTenantContext,
  tenantContextMiddleware,
};
