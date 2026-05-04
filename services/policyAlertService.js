/**
 * @module policyAlertService
 * @description Helper liviano para el endpoint POST /api/policies/preview (M2-006 RF-44).
 *   Resuelve la política aplicable de la solicitud y evalúa un receipt hipotético.
 */
import prisma from "../database/config/prisma.js";
import {
  evaluateReceiptAgainstPolicy,
  findApplicablePolicy,
} from "./refundRuleEngine.js";

function inferDestinationScope(request) {
  // Si Request.policyEvaluationSnapshot ya tiene el scope congelado, úsalo.
  const snap = request.policyEvaluationSnapshot;
  if (snap && snap.destinationScope) return snap.destinationScope;

  // Heurística: si alguna ruta tiene country origen != country destino → "internacional".
  const routes = request.routeRequests || [];
  const isInternational = routes.some((rr) => {
    const r = rr.route;
    if (!r) return false;
    if (r.idOriginCountry == null || r.idDestinationCountry == null) return false;
    return Number(r.idOriginCountry) !== Number(r.idDestinationCountry);
  });
  return isInternational ? "internacional" : "nacional";
}

/**
 * Pre-evaluación de un receipt aún no creado contra la política aplicable a la solicitud.
 * Usa Request.policyEvaluationSnapshot si existe (RF-46 no retroactividad); si no, busca en vivo.
 * @param {{
 *   requestId: number,
 *   receiptTypeId: number,
 *   amount: number,
 *   currency?: string,
 *   nights?: number,
 *   days?: number,
 *   categoryId?: number | null,
 *   costsCenter?: string | null
 * }} input
 * @returns {Promise<{ exceeded: boolean, policyId: number | null, capId: number | null, capAmount: number | null, capUnit: string | null, currency: string, excessTotal: number, message: string }>}
 */
export async function checkReceiptBeforeSubmit(input) {
  const requestId = Number(input.requestId);
  const request = await prisma.request.findUnique({
    where: { requestId },
    select: {
      requestId: true,
      policyEvaluationSnapshot: true,
      user: { select: { orgId: true } },
      routeRequests: { include: { route: true } },
    },
  });
  if (!request) {
    const err = new Error(`Solicitud ${requestId} no encontrada.`);
    err.status = 404;
    throw err;
  }

  const snapshot = request.policyEvaluationSnapshot;
  let policy = null;
  let caps = [];

  if (snapshot && snapshot.policyId) {
    // Reconstruir desde el snapshot inmovilizado (RF-46).
    policy = {
      policyId: snapshot.policyId,
      orgId: request.user?.orgId ?? null,
      name: snapshot.name,
      categoryId: snapshot.categoryId ?? null,
      destinationScope: snapshot.destinationScope || "any",
      costsCenter: snapshot.costsCenter ?? null,
      dailyPerDiem: snapshot.dailyPerDiem ?? null,
      currency: snapshot.currency || "MXN",
      validFrom: snapshot.validFrom,
      validTo: snapshot.validTo,
      active: true,
    };
    caps = (snapshot.caps || []).map((c) => ({ ...c, policyId: snapshot.policyId }));
  } else if (request.user && request.user.orgId) {
    const policies = await prisma.travelPolicy.findMany({
      where: { orgId: request.user.orgId, active: true },
      include: { expenseCaps: true },
    });
    policy = findApplicablePolicy(policies, {
      categoryId: input.categoryId ?? null,
      destinationScope: inferDestinationScope(request),
      costsCenter: input.costsCenter ?? null,
      evaluationDate: new Date(),
    });
    caps = policy ? policy.expenseCaps : [];
  }

  const result = evaluateReceiptAgainstPolicy(
    {
      receiptTypeId: input.receiptTypeId,
      amount: Number(input.amount),
      currency: input.currency,
      nights: input.nights,
      days: input.days,
    },
    caps,
    policy,
  );

  // Selecciona el cap más restrictivo cuando hay exceso.
  let topBreach = null;
  for (const b of result.excessByCap) {
    if (b.excess > 0 && (!topBreach || b.excessTotal > topBreach.excessTotal)) topBreach = b;
  }

  let message = "";
  if (result.exceeded && topBreach) {
    const fmt = (n) => Number(n).toFixed(2);
    message = `Excede política: tope ${fmt(topBreach.capAmount)} ${topBreach.currency} (${topBreach.capUnit}); ` +
      `monto unitario ${fmt(topBreach.unitAmount)}, exceso total ${fmt(topBreach.excessTotal)}.`;
  } else if (!policy) {
    message = "No hay política aplicable; el monto se aceptará tal cual.";
  } else {
    message = "Dentro de la política.";
  }

  return {
    exceeded: result.exceeded,
    policyId: policy ? policy.policyId : null,
    capId: topBreach ? topBreach.capId : null,
    capAmount: topBreach ? topBreach.capAmount : null,
    capUnit: topBreach ? topBreach.capUnit : null,
    currency: result.snapshot.currency,
    excessTotal: topBreach ? topBreach.excessTotal : 0,
    message,
  };
}
