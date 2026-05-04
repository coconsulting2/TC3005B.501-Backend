/**
 * @module policyService
 * @description CRUD de políticas de viáticos + caps + snapshot al envío de solicitud (M2-006 RF-42, RF-43, RF-46).
 */
import prisma from "../database/config/prisma.js";
import { buildPolicyEvaluationSnapshot, findApplicablePolicy } from "./refundRuleEngine.js";

const VALID_DESTINATION_SCOPES = ["nacional", "internacional", "any"];
const VALID_CAP_UNITS = ["per_night", "per_trip", "per_day", "per_event"];

function ensureScope(scope) {
  if (!VALID_DESTINATION_SCOPES.includes(scope)) {
    const err = new Error(`destinationScope inválido: ${scope}`);
    err.status = 400;
    throw err;
  }
}

function ensureCapUnit(unit) {
  if (!VALID_CAP_UNITS.includes(unit)) {
    const err = new Error(`capUnit inválido: ${unit}`);
    err.status = 400;
    throw err;
  }
}

function ensureValidDates(validFrom, validTo) {
  if (!validFrom) {
    const err = new Error("validFrom requerido.");
    err.status = 400;
    throw err;
  }
  if (validTo) {
    const from = new Date(validFrom);
    const to = new Date(validTo);
    if (from > to) {
      const err = new Error("validFrom debe ser <= validTo.");
      err.status = 400;
      throw err;
    }
  }
}

/**
 * Detecta solapamiento exacto en tupla (orgId, categoryId, destinationScope, costsCenter, rangos).
 * @param {object} tx - prisma client o transaction
 * @param {object} payload
 * @param {number} [excludePolicyId]
 * @returns {Promise<boolean>}
 */
async function hasOverlap(tx, payload, excludePolicyId = null) {
  const where = {
    orgId: payload.orgId,
    categoryId: payload.categoryId ?? null,
    destinationScope: payload.destinationScope,
    costsCenter: payload.costsCenter ?? null,
    active: true,
  };
  if (excludePolicyId !== null) where.NOT = { policyId: Number(excludePolicyId) };

  const candidates = await tx.travelPolicy.findMany({ where });
  const reqFrom = new Date(payload.validFrom);
  const reqTo = payload.validTo ? new Date(payload.validTo) : null;

  return candidates.some((p) => {
    const pFrom = new Date(p.validFrom);
    const pTo = p.validTo ? new Date(p.validTo) : null;
    // Overlap if !(reqTo < pFrom || (pTo && reqFrom > pTo))
    if (reqTo && reqTo < pFrom) return false;
    if (pTo && reqFrom > pTo) return false;
    return true;
  });
}

/**
 * Lists travel policies for an org with optional filters.
 * @param {bigint | number} orgId
 * @param {{ activeOnly?: boolean, categoryId?: number, asOfDate?: Date | string }} [filters]
 * @returns {Promise<Array>}
 */
export async function listPolicies(orgId, filters = {}) {
  const where = { orgId };
  if (filters.activeOnly !== false) where.active = true;
  if (filters.categoryId !== undefined && filters.categoryId !== null) where.categoryId = Number(filters.categoryId);
  if (filters.asOfDate) {
    const date = new Date(filters.asOfDate);
    where.validFrom = { lte: date };
    where.OR = [{ validTo: null }, { validTo: { gte: date } }];
  }
  return prisma.travelPolicy.findMany({
    where,
    include: { expenseCaps: true, category: true },
    orderBy: [{ validFrom: "desc" }],
  });
}

/**
 * Reads one policy with its caps, scoped to org.
 * @param {number} policyId
 * @param {bigint | number} orgId
 * @returns {Promise<Object | null>}
 */
export async function getPolicy(policyId, orgId) {
  const row = await prisma.travelPolicy.findUnique({
    where: { policyId: Number(policyId) },
    include: { expenseCaps: true, category: true },
  });
  if (!row || String(row.orgId) !== String(orgId)) return null;
  return row;
}

/**
 * Creates a new policy with its caps.
 * @param {bigint | number} orgId
 * @param {object} payload
 * @returns {Promise<Object>}
 */
export async function createPolicy(orgId, payload) {
  const scope = payload.destinationScope || "any";
  ensureScope(scope);
  ensureValidDates(payload.validFrom, payload.validTo);
  for (const c of payload.caps || []) ensureCapUnit(c.capUnit);

  const data = {
    orgId,
    name: String(payload.name).trim(),
    categoryId: payload.categoryId ?? null,
    destinationScope: scope,
    costsCenter: payload.costsCenter ? String(payload.costsCenter).trim() : null,
    dailyPerDiem: payload.dailyPerDiem ?? null,
    currency: payload.currency || "MXN",
    validFrom: new Date(payload.validFrom),
    validTo: payload.validTo ? new Date(payload.validTo) : null,
    active: true,
  };

  return prisma.$transaction(async (tx) => {
    if (await hasOverlap(tx, data)) {
      const err = new Error("Ya existe una política activa que solapa con la combinación (categoría, destino, centro de costos) y rango de vigencia.");
      err.status = 409;
      throw err;
    }
    const policy = await tx.travelPolicy.create({ data });
    if (payload.caps && payload.caps.length > 0) {
      await tx.policyExpenseCap.createMany({
        data: payload.caps.map((c) => ({
          policyId: policy.policyId,
          receiptTypeId: Number(c.receiptTypeId),
          capAmount: c.capAmount,
          capUnit: c.capUnit,
          currency: c.currency || "MXN",
        })),
      });
    }
    return tx.travelPolicy.findUnique({
      where: { policyId: policy.policyId },
      include: { expenseCaps: true, category: true },
    });
  });
}

/**
 * Updates a policy. Caps are replaced atomically (idempotent setExpenseCaps semantics).
 * Does NOT mutate Request.policyEvaluationSnapshot of previously sent requests (RF-46).
 * @param {number} policyId
 * @param {bigint | number} orgId
 * @param {object} payload
 * @returns {Promise<Object>}
 */
export async function updatePolicy(policyId, orgId, payload) {
  const existing = await getPolicy(policyId, orgId);
  if (!existing) {
    const err = new Error(`Política ${policyId} no encontrada.`);
    err.status = 404;
    throw err;
  }
  if (payload.destinationScope) ensureScope(payload.destinationScope);
  if (payload.validFrom || payload.validTo) {
    ensureValidDates(payload.validFrom ?? existing.validFrom, payload.validTo ?? existing.validTo);
  }
  for (const c of payload.caps || []) ensureCapUnit(c.capUnit);

  const data = {};
  if (payload.name !== undefined)             data.name = String(payload.name).trim();
  if (payload.categoryId !== undefined)       data.categoryId = payload.categoryId;
  if (payload.destinationScope !== undefined) data.destinationScope = payload.destinationScope;
  if (payload.costsCenter !== undefined)      data.costsCenter = payload.costsCenter ? String(payload.costsCenter).trim() : null;
  if (payload.dailyPerDiem !== undefined)     data.dailyPerDiem = payload.dailyPerDiem;
  if (payload.currency !== undefined)         data.currency = payload.currency;
  if (payload.validFrom !== undefined)        data.validFrom = new Date(payload.validFrom);
  if (payload.validTo !== undefined)          data.validTo = payload.validTo ? new Date(payload.validTo) : null;
  if (payload.active !== undefined)           data.active = Boolean(payload.active);

  return prisma.$transaction(async (tx) => {
    const checkPayload = { ...existing, ...data, orgId };
    if (await hasOverlap(tx, checkPayload, policyId)) {
      const err = new Error("La actualización solaparía con otra política activa.");
      err.status = 409;
      throw err;
    }
    await tx.travelPolicy.update({ where: { policyId: Number(policyId) }, data });
    if (payload.caps !== undefined) {
      await setExpenseCapsTx(tx, Number(policyId), payload.caps);
    }
    return tx.travelPolicy.findUnique({
      where: { policyId: Number(policyId) },
      include: { expenseCaps: true, category: true },
    });
  });
}

/**
 * Soft-deletes (active=false). Idempotent.
 * @param {number} policyId
 * @param {bigint | number} orgId
 */
export async function deactivatePolicy(policyId, orgId) {
  const existing = await getPolicy(policyId, orgId);
  if (!existing) {
    const err = new Error(`Política ${policyId} no encontrada.`);
    err.status = 404;
    throw err;
  }
  return prisma.travelPolicy.update({
    where: { policyId: Number(policyId) },
    data: { active: false },
  });
}

async function setExpenseCapsTx(tx, policyId, caps) {
  await tx.policyExpenseCap.deleteMany({ where: { policyId } });
  if (caps.length === 0) return;
  await tx.policyExpenseCap.createMany({
    data: caps.map((c) => ({
      policyId,
      receiptTypeId: Number(c.receiptTypeId),
      capAmount: c.capAmount,
      capUnit: c.capUnit,
      currency: c.currency || "MXN",
    })),
  });
}

/**
 * Idempotent replacement of expense caps for a policy.
 * @param {number} policyId
 * @param {bigint | number} orgId
 * @param {Array<{receiptTypeId:number, capAmount:number, capUnit:string, currency?:string}>} caps
 */
export async function setExpenseCaps(policyId, orgId, caps) {
  const existing = await getPolicy(policyId, orgId);
  if (!existing) {
    const err = new Error(`Política ${policyId} no encontrada.`);
    err.status = 404;
    throw err;
  }
  for (const c of caps) ensureCapUnit(c.capUnit);
  return prisma.$transaction(async (tx) => {
    await setExpenseCapsTx(tx, Number(policyId), caps);
    return tx.travelPolicy.findUnique({
      where: { policyId: Number(policyId) },
      include: { expenseCaps: true },
    });
  });
}

/**
 * Resolves the applicable policy for a request and its evaluation context, then
 * freezes it into Request.policyEvaluationSnapshot. Idempotent: re-running on
 * a request that already has a snapshot will overwrite it. Caller is responsible
 * for choosing when to call this (e.g. on confirmDraft / createTravelRequest).
 *
 * @param {object} tx - Prisma transaction client (or prisma)
 * @param {number} requestId
 * @param {{ destinationScope: "nacional" | "internacional" | "any", categoryId?: number | null, costsCenter?: string | null }} ctx
 * @returns {Promise<{ policyId: number | null, snapshot: object | null }>}
 */
export async function snapshotPolicyForRequest(tx, requestId, ctx) {
  const db = tx || prisma;
  const req = await db.request.findUnique({
    where: { requestId: Number(requestId) },
    select: { requestId: true, user: { select: { orgId: true } } },
  });
  if (!req || !req.user || !req.user.orgId) return { policyId: null, snapshot: null };

  const policies = await db.travelPolicy.findMany({
    where: { orgId: req.user.orgId, active: true },
    include: { expenseCaps: true },
  });
  const policy = findApplicablePolicy(policies, {
    categoryId: ctx.categoryId ?? null,
    destinationScope: ctx.destinationScope,
    costsCenter: ctx.costsCenter ?? null,
    evaluationDate: new Date(),
  });
  const caps = policy ? policy.expenseCaps : [];
  const snapshot = buildPolicyEvaluationSnapshot(policy, caps, { requestId, orgId: req.user.orgId });

  await db.request.update({
    where: { requestId: Number(requestId) },
    data: { policyEvaluationSnapshot: snapshot },
  });

  return { policyId: policy ? policy.policyId : null, snapshot };
}
