/**
 * Construye snapshots pre/post para persistir en Request (solo solicitudes nuevas / confirmadas).
 */
import { buildSnapshot } from "./workflowRulesEngine.js";
import { resolveN1N2Approvers } from "./approverResolver.js";

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {Object} opts
 * @param {bigint | number | null | undefined} opts.orgId
 * @param {number | null | undefined} opts.departmentId
 * @param {number | string | undefined} opts.requestedFee
 * @param {number[]} opts.destinationCountryIds
 * @param {number[]} [opts.receiptTypeIds]
 * @param {number | null} [opts.orgLevel]
 * @param {string} [opts.currency]
 * @returns {Promise<{ pre: import('./workflowRulesEngine.js').WorkflowSnapshot | null, post: import('./workflowRulesEngine.js').WorkflowSnapshot | null }>}
 */
export async function buildRequestWorkflowSnapshots(tx, opts) {
  const {
    orgId,
    departmentId,
    requestedFee,
    destinationCountryIds,
    receiptTypeIds = [],
    orgLevel = null,
    currency = "MXN",
  } = opts;

  if (orgId === null || orgId === undefined) {
    return { pre: null, post: null };
  }

  const oid = typeof orgId === "bigint" ? orgId : BigInt(orgId);

  const rules = await tx.workflowRule.findMany({
    where: { orgId: oid, active: true },
  });

  const approvers = await resolveN1N2Approvers(tx, oid, departmentId);

  const ctx = {
    amount: Number(requestedFee) || 0,
    currency,
    destinationCountryIds: destinationCountryIds || [],
    receiptTypeIds,
    orgLevel,
  };

  const pre = buildSnapshot(rules, ctx, "pre", approvers);
  const post = buildSnapshot(rules, ctx, "post", approvers);

  return { pre, post };
}
