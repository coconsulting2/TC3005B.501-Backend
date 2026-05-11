/**
 * @module database/config/rlsConnection
 * @description Helpers para sincronizar el GUC `app.current_organization_id` (usado
 * por las políticas Row-Level Security) con el tenantContext de Node.
 *
 * Estrategia: cada request HTTP pasa por `applyRlsForRequest` que ejecuta
 * `SELECT set_config('app.current_organization_id', $orgId, false)` sobre la sesión
 * Postgres (no transaction-local porque Prisma usa connection pooling y los SET
 * LOCAL solo viven dentro de la transacción). El `false` (NOT local) hace que el
 * setting persista para la sesión hasta el próximo set_config — al regresar al pool,
 * el siguiente request lo sobrescribe.
 *
 * Para operaciones que deben ser estrictamente aisladas (e.g. cross-org bypass por
 * super-admin), usar `withRls(prisma, orgId, work)` que abre una transacción y
 * aplica SET LOCAL al inicio.
 */
import prisma from "./prisma.js";

/**
 * Aplica el GUC sobre la conexión actual (sesión-scoped, no transaccional).
 * Se llama desde middleware/tenantContext o desde withTenantContext.
 *
 * @param {bigint|number|string} orgId
 * @param {{ bypass?: boolean }} [opts]
 */
export async function applyRlsSetting(orgId, opts = {}) {
  const orgIdStr = String(orgId);
  await prisma.$executeRawUnsafe(
    `SELECT set_config('app.current_organization_id', '${orgIdStr.replace(/'/g, "''")}', false)`
  );
  await prisma.$executeRawUnsafe(
    `SELECT set_config('app.bypass_tenant', '${opts.bypass ? "on" : ""}', false)`
  );
}

/**
 * Limpia los GUCs (útil al finalizar request en pool conmutado).
 */
export async function clearRlsSetting() {
  await prisma.$executeRawUnsafe(`SELECT set_config('app.current_organization_id', '', false)`);
  await prisma.$executeRawUnsafe(`SELECT set_config('app.bypass_tenant', '', false)`);
}

/**
 * Express middleware que setea los GUCs antes de cada request basado en req.tenant
 * (poblado por tenantContextMiddleware). NO bloquea si req.tenant no existe (rutas
 * públicas como /api/user/login no requieren contexto).
 */
export const applyRlsForRequest = async (req, res, next) => {
  if (!req.tenant) return next();
  try {
    await applyRlsSetting(req.tenant.orgId, { bypass: req.tenant.bypassTenant });
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Ejecuta una función dentro de una transacción con SET LOCAL del GUC.
 * Útil para operaciones donde queremos garantizar aislamiento estricto y que
 * el bypass no se filtre a otros requests via el pool.
 *
 * @template T
 * @param {bigint|number|string} orgId
 * @param {{ bypass?: boolean }} opts
 * @param {(tx: any) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withRls(orgId, opts, work) {
  return prisma.$transaction(async (tx) => {
    const orgIdStr = String(orgId).replace(/'/g, "''");
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_organization_id', '${orgIdStr}', true)`);
    if (opts?.bypass) {
      await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_tenant', 'on', true)`);
    }
    return work(tx);
  });
}
