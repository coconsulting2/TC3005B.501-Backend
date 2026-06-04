/**
 * @module chartOfAccountService
 * @description CRUD del catálogo contable maestro (ChartOfAccount) por organización (US-24 / RF-74).
 *   Reemplaza el hard-code de config/accountingCatalogs.js; es consumido por accountingExportService
 *   para resolver cuentas de mayor (anticipo, CxP, gasto, IVA). Todas las operaciones están
 *   aisladas por organización.
 */
import prisma from "../database/config/prisma.js";

/** @param {bigint|number|string} v */
const toBig = (v) => BigInt(v);

/** @param {number|string} accountId */
function notFound(accountId) {
  const err = new Error(`Cuenta contable ${accountId} no encontrada.`);
  err.status = 404;
  return err;
}

/**
 * Lists chart-of-account rows for an organization. By default returns only active rows.
 * @param {bigint|number} organizationId
 * @param {{ activeOnly?: boolean }} [opts]
 * @returns {Promise<Array>}
 */
export async function listAccounts(organizationId, opts = {}) {
  const where = { organizationId: toBig(organizationId) };
  if (opts.activeOnly !== false) where.active = true;
  return prisma.chartOfAccount.findMany({ where, orderBy: [{ accountCode: "asc" }] });
}

/**
 * Reads one account by id (scoped to org). Returns null if not found or cross-org.
 * @param {number|bigint} accountId
 * @param {bigint|number} organizationId
 * @returns {Promise<Object|null>}
 */
export async function getAccount(accountId, organizationId) {
  const row = await prisma.chartOfAccount.findUnique({ where: { accountId: toBig(accountId) } });
  if (!row || String(row.organizationId) !== String(organizationId)) return null;
  return row;
}

/**
 * Validates a parentAccountId: must exist in the same org. On update, also prevents self-parenting
 * and cycles (the account being updated must not be an ancestor of the chosen parent).
 * @param {number|bigint|null|undefined} parentAccountId
 * @param {bigint|number} organizationId
 * @param {number|bigint|null} [selfAccountId]
 * @returns {Promise<bigint|null>}
 */
async function validateParent(parentAccountId, organizationId, selfAccountId = null) {
  if (parentAccountId === null || parentAccountId === undefined) return null;
  const parentId = toBig(parentAccountId);

  if (selfAccountId !== null && String(parentId) === String(toBig(selfAccountId))) {
    const err = new Error("Una cuenta no puede ser su propio padre.");
    err.status = 400;
    throw err;
  }

  const parent = await getAccount(parentId, organizationId);
  if (!parent) {
    const err = new Error(`parentAccountId ${parentAccountId} no existe en esta organización.`);
    err.status = 400;
    throw err;
  }

  // Cycle guard: walk up the parent chain; selfAccountId must not appear as an ancestor.
  if (selfAccountId !== null) {
    const selfStr = String(toBig(selfAccountId));
    const seen = new Set();
    let cursor = parent;
    while (cursor && cursor.parentAccountId !== null) {
      const pid = String(cursor.parentAccountId);
      if (pid === selfStr) {
        const err = new Error("parentAccountId genera un ciclo en la jerarquía de cuentas.");
        err.status = 400;
        throw err;
      }
      if (seen.has(pid)) break;
      seen.add(pid);
      cursor = await prisma.chartOfAccount.findUnique({ where: { accountId: cursor.parentAccountId } });
    }
  }

  return parentId;
}

/**
 * Creates a chart-of-account row. Maps unique-violation (organizationId, accountCode) to 409.
 * @param {bigint|number} organizationId
 * @param {{ accountCode: string, accountName: string, accountType: string, parentAccountId?: number|null, active?: boolean }} payload
 * @returns {Promise<Object>}
 */
export async function createAccount(organizationId, payload) {
  const orgId = toBig(organizationId);
  const parentAccountId = await validateParent(payload.parentAccountId, orgId);
  try {
    return await prisma.chartOfAccount.create({
      data: {
        organizationId: orgId,
        accountCode: String(payload.accountCode).trim(),
        accountName: String(payload.accountName).trim(),
        accountType: String(payload.accountType).trim(),
        parentAccountId,
        active: payload.active === undefined ? true : Boolean(payload.active),
      },
    });
  } catch (err) {
    if (err.code === "P2002") {
      const e = new Error(`Cuenta con código "${payload.accountCode}" ya existe en esta organización.`);
      e.status = 409;
      throw e;
    }
    throw err;
  }
}

/**
 * Updates an account (org-scoped). accountCode is immutable (stable identifier). Re-validates parent.
 * @param {number|bigint} accountId
 * @param {bigint|number} organizationId
 * @param {{ accountName?: string, accountType?: string, parentAccountId?: number|null, active?: boolean }} payload
 * @returns {Promise<Object>}
 */
export async function updateAccount(accountId, organizationId, payload) {
  const existing = await getAccount(accountId, organizationId);
  if (!existing) throw notFound(accountId);

  const data = {};
  if (payload.accountName !== undefined) data.accountName = String(payload.accountName).trim();
  if (payload.accountType !== undefined) data.accountType = String(payload.accountType).trim();
  if (payload.active !== undefined) data.active = Boolean(payload.active);
  if (payload.parentAccountId !== undefined) {
    data.parentAccountId = await validateParent(payload.parentAccountId, organizationId, accountId);
  }

  return prisma.chartOfAccount.update({ where: { accountId: toBig(accountId) }, data });
}

/**
 * Soft-deletes an account (active=false). Org-scoped. Refuses if:
 *   - the account is a system account, or
 *   - it is referenced by a ReceiptType (gasto/IVA GL account code) — "no eliminar si asociado", or
 *   - it still has active child accounts.
 * @param {number|bigint} accountId
 * @param {bigint|number} organizationId
 * @returns {Promise<Object>}
 */
export async function deactivateAccount(accountId, organizationId) {
  const existing = await getAccount(accountId, organizationId);
  if (!existing) throw notFound(accountId);

  if (existing.isSystem) {
    const err = new Error("No se puede desactivar una cuenta del sistema.");
    err.status = 400;
    throw err;
  }

  const referencingReceiptTypes = await prisma.receiptType.count({
    where: {
      organizationId: toBig(organizationId),
      OR: [{ gastoGlAccountCode: existing.accountCode }, { ivaGlAccountCode: existing.accountCode }],
    },
  });
  if (referencingReceiptTypes > 0) {
    const err = new Error(
      `La cuenta "${existing.accountCode}" está asociada a ${referencingReceiptTypes} tipo(s) de comprobante; no se puede desactivar.`,
    );
    err.status = 409;
    throw err;
  }

  const activeChildren = await prisma.chartOfAccount.count({
    where: { organizationId: toBig(organizationId), parentAccountId: existing.accountId, active: true },
  });
  if (activeChildren > 0) {
    const err = new Error(`La cuenta tiene ${activeChildren} subcuenta(s) activa(s); desactívelas primero.`);
    err.status = 409;
    throw err;
  }

  return prisma.chartOfAccount.update({ where: { accountId: toBig(accountId) }, data: { active: false } });
}
