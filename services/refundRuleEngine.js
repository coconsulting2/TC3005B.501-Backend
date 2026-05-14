/**
 * @module refundRuleEngine
 * @description Motor puro de evaluación de políticas de reembolso (M2-006).
 *   Recibe estructuras planas (sin acceso a Prisma) y produce decisiones
 *   { exceeded, excess, snapshot } que el caller persiste o muestra en UI.
 *   Patrón inspirado en workflowRulesEngine.js (M2-004).
 *
 *   RFs cubiertos: RF-42, RF-43, RF-44 (preview), RF-46 (vigencia + snapshot).
 *   No cubre RF-37/39 (plazo) — eso vive en reimbursementTimeService.
 */

/** @typedef {"per_night" | "per_trip" | "per_day" | "per_event"} CapUnit */
/** @typedef {"nacional" | "internacional" | "any"} DestinationScope */

/**
 * @typedef {Object} ExpenseCapRow
 * @property {number} capId
 * @property {number} policyId
 * @property {number} receiptTypeId
 * @property {import("@prisma/client/runtime/library").Decimal | number} capAmount
 * @property {CapUnit} capUnit
 * @property {string} currency
 */

/**
 * @typedef {Object} TravelPolicyRow
 * @property {number} policyId
 * @property {bigint | number} organizationId
 * @property {string} name
 * @property {number | null} categoryId
 * @property {DestinationScope} destinationScope
 * @property {string | null} costsCenter
 * @property {import("@prisma/client/runtime/library").Decimal | number | null} dailyPerDiem
 * @property {string} currency
 * @property {Date | string} validFrom
 * @property {Date | string | null} validTo
 * @property {boolean} active
 */

/**
 * @typedef {Object} ReceiptInput
 * @property {number} [receiptId]
 * @property {number} receiptTypeId
 * @property {number} amount
 * @property {string} [currency]
 * @property {number} [nights] - Solo para caps per_night.
 * @property {number} [days]   - Solo para caps per_day.
 */

/**
 * @typedef {Object} ApplicabilityCtx
 * @property {number | null} [categoryId]
 * @property {DestinationScope} destinationScope
 * @property {string | null} [costsCenter]
 * @property {Date} [evaluationDate]
 */

/**
 * @typedef {Object} CapBreach
 * @property {number} capId
 * @property {number} receiptTypeId
 * @property {CapUnit} capUnit
 * @property {number} capAmount
 * @property {number} unitAmount  - amount / unidad (ej. amount/nights para per_night).
 * @property {number} excess      - delta unitario sobre el cap (cero si dentro del cap).
 * @property {number} excessTotal - excess proyectado al total (excess * unidades).
 * @property {string} currency
 */

/**
 * @typedef {Object} ReceiptEvaluationResult
 * @property {boolean} ok                 - true si ningún cap aplicable se excede.
 * @property {boolean} exceeded           - !ok (azúcar para callers).
 * @property {CapBreach[]} excessByCap    - lista de caps relevantes (excess>0 implica breach).
 * @property {{ policyId: number | null, evaluatedAt: string, receiptTypeId: number, amount: number, currency: string }} snapshot
 */

const num = (v) => {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "object" && typeof v.toNumber === "function") return v.toNumber();
  return Number(v);
};

const toDate = (v) => (v instanceof Date ? v : new Date(v));

/**
 * Filtra políticas vigentes a la fecha dada y retorna la mejor según prioridad.
 *   Prioridad (mayor primero):
 *     - categoryId + costsCenter ambos match (puntaje 4)
 *     - solo categoryId match (puntaje 3)
 *     - solo costsCenter match (puntaje 2)
 *     - catch-all (categoryId=null Y costsCenter=null) (puntaje 1)
 *   destinationScope debe matchear (políticas "any" matchean cualquier destino).
 *   Empate por puntaje → política con validFrom más reciente.
 * @param {TravelPolicyRow[]} policies
 * @param {ApplicabilityCtx} ctx
 * @returns {TravelPolicyRow | null}
 */
export function findApplicablePolicy(policies, ctx) {
  if (!Array.isArray(policies) || policies.length === 0) return null;
  const evaluationDate = ctx.evaluationDate ? toDate(ctx.evaluationDate) : new Date();
  const wantedScope = ctx.destinationScope;

  const scored = [];
  for (const p of policies) {
    if (!p.active) continue;

    const from = toDate(p.validFrom);
    if (from > evaluationDate) continue;
    if (p.validTo) {
      const to = toDate(p.validTo);
      if (to < evaluationDate) continue;
    }

    const scopeOk = p.destinationScope === "any" || p.destinationScope === wantedScope;
    if (!scopeOk) continue;

    const categoryMatch = p.categoryId !== null && p.categoryId !== undefined &&
      ctx.categoryId !== null && ctx.categoryId !== undefined &&
      Number(p.categoryId) === Number(ctx.categoryId);
    const costMatch = p.costsCenter !== null && p.costsCenter !== undefined &&
      ctx.costsCenter !== null && ctx.costsCenter !== undefined &&
      String(p.costsCenter).trim() === String(ctx.costsCenter).trim();
    const catchAll = (p.categoryId === null || p.categoryId === undefined) &&
      (p.costsCenter === null || p.costsCenter === undefined);

    let score = 0;
    if (categoryMatch && costMatch) score = 4;
    else if (categoryMatch) score = 3;
    else if (costMatch) score = 2;
    else if (catchAll) score = 1;
    else continue; // política tiene filtros que no matchean

    scored.push({ policy: p, score });
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return toDate(b.policy.validFrom).getTime() - toDate(a.policy.validFrom).getTime();
  });

  return scored[0].policy;
}

/**
 * Calcula el monto unitario (por noche/día/etc.) según capUnit.
 * @param {number} amount
 * @param {CapUnit} capUnit
 * @param {ReceiptInput} receipt
 * @returns {number}
 */
function unitAmountFor(amount, capUnit, receipt) {
  switch (capUnit) {
    case "per_night": {
      const nights = Math.max(1, Number(receipt.nights || 1));
      return amount / nights;
    }
    case "per_day": {
      const days = Math.max(1, Number(receipt.days || 1));
      return amount / days;
    }
    case "per_trip":
    case "per_event":
    default:
      return amount;
  }
}

/**
 *
 * @param capUnit
 * @param receipt
 */
function unitsCount(capUnit, receipt) {
  if (capUnit === "per_night") return Math.max(1, Number(receipt.nights || 1));
  if (capUnit === "per_day")   return Math.max(1, Number(receipt.days || 1));
  return 1;
}

/**
 * Evalúa un receipt contra los caps relevantes de una política.
 * Retorna ok=true si la política es null o no hay caps aplicables a este receiptType.
 * @param {ReceiptInput} receipt
 * @param {ExpenseCapRow[]} caps - se filtra internamente por receipt.receiptTypeId.
 * @param {TravelPolicyRow | null} policy
 * @returns {ReceiptEvaluationResult}
 */
export function evaluateReceiptAgainstPolicy(receipt, caps, policy) {
  const amount = Number(receipt.amount);
  const currency = (receipt.currency || policy?.currency || "MXN").toUpperCase();
  const evaluatedAt = new Date().toISOString();

  if (!policy) {
    return {
      ok: true,
      exceeded: false,
      excessByCap: [],
      snapshot: { policyId: null, evaluatedAt, receiptTypeId: receipt.receiptTypeId, amount, currency },
    };
  }

  const relevantCaps = (caps || []).filter(
    (c) => Number(c.policyId) === Number(policy.policyId) &&
      Number(c.receiptTypeId) === Number(receipt.receiptTypeId)
  );

  if (relevantCaps.length === 0) {
    return {
      ok: true,
      exceeded: false,
      excessByCap: [],
      snapshot: { policyId: policy.policyId, evaluatedAt, receiptTypeId: receipt.receiptTypeId, amount, currency },
    };
  }

  const excessByCap = relevantCaps.map((cap) => {
    const capAmount = num(cap.capAmount);
    const unitAmount = unitAmountFor(amount, cap.capUnit, receipt);
    const units = unitsCount(cap.capUnit, receipt);
    const excessUnit = unitAmount > capAmount ? (unitAmount - capAmount) : 0;
    const excessTotal = excessUnit * units;
    return {
      capId: cap.capId,
      receiptTypeId: cap.receiptTypeId,
      capUnit: cap.capUnit,
      capAmount,
      unitAmount,
      excess: excessUnit,
      excessTotal,
      currency: cap.currency,
    };
  });

  const exceeded = excessByCap.some((b) => b.excess > 0);

  return {
    ok: !exceeded,
    exceeded,
    excessByCap,
    snapshot: { policyId: policy.policyId, evaluatedAt, receiptTypeId: receipt.receiptTypeId, amount, currency },
  };
}

/**
 * Resumen de evaluación a nivel solicitud: totales claimed/allowed/excess y desglose por receipt.
 * Receipts con excepción APPROVED se cuentan como allowed completamente (excess=0).
 * @param {ReceiptInput[]} receipts
 * @param {ExpenseCapRow[]} caps
 * @param {TravelPolicyRow | null} policy
 * @param {{ approvedExceptionReceiptIds?: number[], perDiemDays?: number }} [opts]
 * @returns {{
 *   totalClaimed: number,
 *   totalAllowed: number,
 *   totalExcess: number,
 *   currency: string,
 *   perReceipt: Array<{ receiptId: number | undefined, amount: number, allowed: number, excess: number, exceeded: boolean, hadExceptionApproved: boolean }>
 * }}
 */
export function summarizeRequestPolicyResult(receipts, caps, policy, opts = {}) {
  const approvedSet = new Set((opts.approvedExceptionReceiptIds || []).map(Number));
  const currency = (policy?.currency || "MXN").toUpperCase();

  let totalClaimed = 0;
  let totalAllowed = 0;
  let totalExcess = 0;
  const perReceipt = [];

  for (const r of receipts || []) {
    const amount = Number(r.amount);
    totalClaimed += amount;

    const hadExceptionApproved = r.receiptId !== undefined && approvedSet.has(Number(r.receiptId));
    if (hadExceptionApproved) {
      totalAllowed += amount;
      perReceipt.push({ receiptId: r.receiptId, amount, allowed: amount, excess: 0, exceeded: false, hadExceptionApproved: true });
      continue;
    }

    const result = evaluateReceiptAgainstPolicy(r, caps, policy);
    const excessTotal = result.excessByCap.reduce((acc, b) => acc + b.excessTotal, 0);
    const allowed = Math.max(0, amount - excessTotal);

    totalAllowed += allowed;
    totalExcess  += excessTotal;
    perReceipt.push({ receiptId: r.receiptId, amount, allowed, excess: excessTotal, exceeded: result.exceeded, hadExceptionApproved: false });
  }

  return { totalClaimed, totalAllowed, totalExcess, currency, perReceipt };
}

/**
 * Construye el snapshot inmovilizado de la política para guardar en Request.policyEvaluationSnapshot.
 * Garantiza no retroactividad (RF-46): cambios futuros en la política no afectan solicitudes ya enviadas.
 * @param {TravelPolicyRow | null} policy
 * @param {ExpenseCapRow[]} caps
 * @param {{ organizationId?: bigint | number, requestId?: number, evaluationDate?: Date }} requestCtx
 * @returns {object | null}
 */
export function buildPolicyEvaluationSnapshot(policy, caps, requestCtx = {}) {
  if (!policy) return null;
  const evaluatedAt = (requestCtx.evaluationDate ? toDate(requestCtx.evaluationDate) : new Date()).toISOString();

  const frozenCaps = (caps || [])
    .filter((c) => Number(c.policyId) === Number(policy.policyId))
    .map((c) => ({
      capId: c.capId,
      receiptTypeId: c.receiptTypeId,
      capAmount: num(c.capAmount),
      capUnit: c.capUnit,
      currency: c.currency,
    }));

  return {
    policyId: policy.policyId,
    name: policy.name,
    categoryId: policy.categoryId,
    destinationScope: policy.destinationScope,
    costsCenter: policy.costsCenter,
    dailyPerDiem: policy.dailyPerDiem !== null && policy.dailyPerDiem !== undefined ? num(policy.dailyPerDiem) : null,
    currency: policy.currency,
    validFrom: toDate(policy.validFrom).toISOString(),
    validTo: policy.validTo ? toDate(policy.validTo).toISOString() : null,
    caps: frozenCaps,
    evaluatedAt,
    requestId: requestCtx.requestId ?? null,
  };
}
