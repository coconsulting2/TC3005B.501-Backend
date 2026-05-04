/**
 * @module applyRefundContext
 * @description Helper invocado al crear/confirmar una solicitud para llenar
 *   Request.tripEndDate y Request.policyEvaluationSnapshot (M2-006 RF-46 no retroactividad).
 *   Idempotente: re-ejecutar sobre la misma request sobreescribe los campos.
 */
import { snapshotPolicyForRequest } from "./policyService.js";

const HOME_COUNTRY_ID = 1; // México

function inferDestinationScope(routes) {
  const isInternational = (routes || []).some((r) => {
    if (r.idDestinationCountry == null) return false;
    return Number(r.idDestinationCountry) !== HOME_COUNTRY_ID;
  });
  return isInternational ? "internacional" : "nacional";
}

function maxEndingDate(routes) {
  let max = null;
  for (const r of routes || []) {
    if (!r.endingDate) continue;
    const d = r.endingDate instanceof Date ? r.endingDate : new Date(r.endingDate);
    if (!max || d > max) max = d;
  }
  return max;
}

/**
 * Carga las routes de un request, computa tripEndDate y snapshot, persiste ambos.
 * Si la request no existe o no tiene routes, no hace nada.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {number} requestId
 * @param {{ categoryId?: number | null, costsCenter?: string | null }} [ctx]
 * @returns {Promise<{ tripEndDate: Date | null, policyId: number | null }>}
 */
export async function applyRefundContextToRequest(tx, requestId, ctx = {}) {
  const id = Number(requestId);
  const routeRequests = await tx.routeRequest.findMany({
    where: { requestId: id },
    include: { route: true },
  });
  const routes = routeRequests.map((rr) => rr.route).filter(Boolean);

  const tripEndDate = maxEndingDate(routes);
  if (tripEndDate) {
    await tx.request.update({
      where: { requestId: id },
      data: { tripEndDate },
    });
  }

  const destinationScope = inferDestinationScope(routes);
  const { policyId } = await snapshotPolicyForRequest(tx, id, {
    categoryId: ctx.categoryId ?? null,
    destinationScope,
    costsCenter: ctx.costsCenter ?? null,
  });

  return { tripEndDate, policyId };
}
