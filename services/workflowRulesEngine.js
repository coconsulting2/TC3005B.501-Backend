/**
 * @module workflowRulesEngine
 * @description Evalúa workflow_rules (M2-004) y produce snapshots pre/post para solicitudes nuevas.
 */

/** @typedef {'pre' | 'post'} RuleType */
/** @typedef {'importe' | 'nivel' | 'gasto' | 'destino' | 'moneda'} ParamType */

/**
 * @typedef {Object} WorkflowRuleRow
 * @property {bigint} id
 * @property {bigint} orgId
 * @property {string} ruleType
 * @property {string} paramType
 * @property {import('@prisma/client/runtime/library').Decimal | null} threshold
 * @property {string | null} paramValue
 * @property {number} approvalLevel
 * @property {import('@prisma/client/runtime/library').Decimal | null} skipIfBelow
 * @property {number} priority
 * @property {boolean} active
 */

/**
 * @typedef {Object} EvaluationContext
 * @property {number} amount - Importe base (ej. requested_fee o suma comprobantes)
 * @property {string} [currency] - ISO 4217
 * @property {number[]} [destinationCountryIds]
 * @property {number[]} [receiptTypeIds]
 * @property {number | null} [orgLevel] - Nivel organizacional del solicitante (1–n)
 */

/**
 * @typedef {Object} WorkflowSnapshot
 * @property {'pre' | 'post'} ruleType
 * @property {number[]} levels - Niveles requeridos en orden (1=N1, 2=N2)
 * @property {number | null} n1UserId
 * @property {number | null} n2UserId
 * @property {boolean} skipApplied
 * @property {number} amountEvaluated
 * @property {string} currencyEvaluated
 * @property {number} maxApprovalLevel
 * @property {number} minApprovalLevel - Tras aplicar skip_if_below
 */

const num = (v) => (v === null || v === undefined ? NaN : Number(v));

/**
 * @param {WorkflowRuleRow} rule
 * @param {EvaluationContext} ctx
 * @returns {boolean}
 */
function ruleMatches(rule, ctx) {
  const cur = (ctx.currency || "MXN").trim().toUpperCase();
  switch (rule.paramType) {
    case "importe":
      return rule.threshold !== null && num(rule.threshold) >= ctx.amount;
    case "moneda":
      return (rule.paramValue || "").trim().toUpperCase() === cur;
    case "destino": {
      const want = Number(rule.paramValue);
      const ids = ctx.destinationCountryIds || [];
      return ids.some((id) => Number(id) === want);
    }
    case "gasto": {
      const want = Number(rule.paramValue);
      const ids = ctx.receiptTypeIds || [];
      return ids.some((id) => Number(id) === want);
    }
    case "nivel":
      return ctx.orgLevel !== null &&
        ctx.orgLevel !== undefined &&
        String(ctx.orgLevel) === String(rule.paramValue || "").trim();
    default:
      return false;
  }
}

/**
 * Mejor banda de importe: menor threshold tal que amount <= threshold.
 * @param {number} amount
 * @param {WorkflowRuleRow[]} importeRules
 * @returns {number} approval_level de esa banda o 2 por defecto
 */
function maxLevelFromImporteBands(amount, importeRules) {
  const candidates = importeRules
    .filter((r) => r.threshold !== null && amount <= num(r.threshold))
    .sort((a, b) => num(a.threshold) - num(b.threshold));
  if (candidates.length === 0) return 2;
  return candidates[0].approvalLevel;
}

/**
 * @param {WorkflowRuleRow[]} rules
 * @param {EvaluationContext} ctx
 * @param {RuleType} ruleType
 * @returns {{ maxLevel: number, minTier: number, skipApplied: boolean }}
 */
function computeLevelsFromRules(rules, ctx, ruleType) {
  const scoped = rules.filter((r) => r.ruleType === ruleType && r.active);

  const importeRules = scoped.filter((r) => r.paramType === "importe");
  let maxLevel = maxLevelFromImporteBands(ctx.amount, importeRules);

  const other = scoped.filter((r) => r.paramType !== "importe");
  for (const r of other) {
    if (ruleMatches(r, ctx)) {
      maxLevel = Math.max(maxLevel, r.approvalLevel);
    }
  }

  maxLevel = Math.min(2, Math.max(1, maxLevel));

  let minTier = 1;
  let skipApplied = false;
  for (const r of scoped) {
    if (r.skipIfBelow !== null && ctx.amount < num(r.skipIfBelow)) {
      skipApplied = true;
      minTier = Math.max(minTier, r.approvalLevel);
    }
  }

  maxLevel = Math.max(maxLevel, minTier);

  const levels = [];
  for (let L = minTier; L <= maxLevel; L++) levels.push(L);

  return { maxLevel, minTier, skipApplied, levels };
}

/**
 * @param {WorkflowRuleRow[]} rules
 * @param {EvaluationContext} ctx
 * @param {RuleType} ruleType
 * @param {{ n1UserId: number | null, n2UserId: number | null }} approvers
 * @returns {WorkflowSnapshot}
 */
export function buildSnapshot(rules, ctx, ruleType, approvers) {
  const { maxLevel, minTier, skipApplied, levels } = computeLevelsFromRules(rules, ctx, ruleType);
  const currency = (ctx.currency || "MXN").trim().toUpperCase();

  return {
    ruleType,
    levels,
    n1UserId: levels.includes(1) ? approvers.n1UserId : null,
    n2UserId: levels.includes(2) ? approvers.n2UserId : null,
    skipApplied,
    amountEvaluated: ctx.amount,
    currencyEvaluated: currency,
    maxApprovalLevel: maxLevel,
    minApprovalLevel: minTier,
  };
}

/**
 * Estado inicial de solicitud según niveles (mapa ids seed.js: 2=Primera Revisión, 3=Segunda).
 * @param {number[]} levels
 * @returns {number} requestStatusId
 */
export function initialStatusFromLevels(levels) {
  if (!levels.length) return 2;
  const head = Math.min(...levels);
  if (head === 1) return 2;
  if (head === 2) return 3;
  return 2;
}

/**
 * Tras aprobación en Primera Revisión (status 2).
 * @param {number[]} levels
 * @returns {number} siguiente requestStatusId
 */
export function statusAfterN1Approval(levels) {
  return levels.includes(2) ? 3 : 4;
}

/**
 * Tras aprobación en Segunda Revisión (status 3) — siempre a cotización.
 * @returns {number}
 */
export function statusAfterN2Approval() {
  return 4;
}

export { ruleMatches, computeLevelsFromRules, maxLevelFromImporteBands };
