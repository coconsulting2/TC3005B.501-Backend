/**
 * @module refundController
 * @description Endpoints de plazo de reembolso, excepciones y resúmenes (M2-006).
 */
import prisma from "../database/config/prisma.js";
import * as timeService from "../services/reimbursementTimeService.js";
import * as exceptionService from "../services/policyExceptionService.js";
import { summarizeRequestPolicyResult } from "../services/refundRuleEngine.js";

async function resolveOrgId(req) {
  const userId = Number(req.user.user_id);
  const user = await prisma.user.findUnique({ where: { userId }, select: { organizationId: true } });
  if (!user || user.organizationId === null) {
    const err = new Error("Usuario sin organización asignada.");
    err.status = 403;
    throw err;
  }
  return user.organizationId;
}

function handleError(res, error, label) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error(`${label}:`, error);
  return res.status(500).json({ error: "Internal server error" });
}

/**
 * GET /api/refunds/time-limit
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const getTimeLimit = async (req, res) => {
  try {
    const organizationId = await resolveOrgId(req);
    const cfg = await timeService.getOrgTimeLimit(organizationId);
    return res.status(200).json(cfg);
  } catch (e) { return handleError(res, e, "refund.getTimeLimit"); }
};

/**
 * PUT /api/refunds/time-limit  body: { daysAfterTrip, graceDays, blockOnExpiry }
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const setTimeLimit = async (req, res) => {
  try {
    const organizationId = await resolveOrgId(req);
    const updatedById = Number(req.user.user_id);
    await timeService.setOrgTimeLimit(organizationId, req.body, updatedById);
    return res.status(200).json({ message: "Configuración actualizada." });
  } catch (e) { return handleError(res, e, "refund.setTimeLimit"); }
};

/**
 * POST /api/refunds/exceptions  (solicitante)
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const createException = async (req, res) => {
  try {
    const requestedById = Number(req.user.user_id);
    const created = await exceptionService.createException({ ...req.body, requestedById });
    return res.status(201).json(created);
  } catch (e) { return handleError(res, e, "refund.createException"); }
};

/**
 * POST /api/refunds/exceptions/:id/decide  body: { decision, decisionNote? }
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const decideException = async (req, res) => {
  try {
    const decidedById = Number(req.user.user_id);
    const updated = await exceptionService.decideException(
      Number(req.params.id),
      req.body.decision,
      decidedById,
      req.body.decisionNote,
    );
    return res.status(200).json(updated);
  } catch (e) { return handleError(res, e, "refund.decideException"); }
};

/**
 * GET /api/refunds/exceptions/pending  (aprobadores)
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const listPendingExceptions = async (req, res) => {
  try {
    const userId = Number(req.user.user_id);
    const rows = await exceptionService.listPendingForApprover(userId);
    return res.status(200).json({ exceptions: rows });
  } catch (e) { return handleError(res, e, "refund.listPending"); }
};

/**
 * GET /api/refunds/by-user/:userId
 * Reemplaza la data mock de /reembolso.astro.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const getRefundDashboardByUser = async (req, res) => {
  try {
    const targetUserId = Number(req.params.userId);
    const callerId = Number(req.user.user_id);
    if (targetUserId !== callerId) {
      // Solo el propio usuario puede ver su panel; otros endpoints (admin/AP) tienen sus propias rutas.
      return res.status(403).json({ error: "No autorizado para consultar reembolsos de otro usuario." });
    }

    const user = await prisma.user.findUnique({
      where: { userId: targetUserId },
      select: { userId: true, wallet: true, organizationId: true },
    });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado." });

    const requests = await prisma.request.findMany({
      where: { userId: targetUserId },
      select: {
        requestId: true, requestStatusId: true, creationDate: true,
        tripEndDate: true, requestedFee: true, imposedFee: true, notes: true,
        receipts: { select: { receiptId: true, amount: true, refund: true, validation: true, submissionDate: true } },
      },
      orderBy: [{ creationDate: "desc" }],
    });

    const history = requests.map((r) => {
      const totalRefundable = r.receipts
        .filter((rc) => rc.refund && rc.validation === "Aprobado")
        .reduce((acc, rc) => acc + Number(rc.amount), 0);
      return {
        requestId: r.requestId,
        date: r.creationDate,
        amount: totalRefundable,
        status: r.requestStatusId,
        tripEndDate: r.tripEndDate,
        notes: r.notes,
        receiptCount: r.receipts.length,
      };
    });

    let pendingDeadlineWarning = null;
    for (const r of requests) {
      if (!r.tripEndDate || !user.organizationId) continue;
      try {
        const within = await timeService.isWithinDeadline(r.requestId);
        if (!within) {
          pendingDeadlineWarning = `La solicitud #${r.requestId} excedió el plazo de comprobación.`;
          break;
        }
      } catch { /* ignore */ }
    }

    return res.status(200).json({
      balance: Number(user.wallet || 0),
      history,
      pendingDeadlineWarning,
    });
  } catch (e) { return handleError(res, e, "refund.byUser"); }
};

/**
 * GET /api/refunds/request/:requestId/summary
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const getRequestSummary = async (req, res) => {
  try {
    const requestId = Number(req.params.requestId);
    const request = await prisma.request.findUnique({
      where: { requestId },
      select: {
        requestId: true, policyEvaluationSnapshot: true,
        receipts: {
          select: { receiptId: true, receiptTypeId: true, amount: true, refund: true },
        },
        policyExceptions: { select: { receiptId: true, status: true } },
      },
    });
    if (!request) return res.status(404).json({ error: "Solicitud no encontrada." });

    const snapshot = request.policyEvaluationSnapshot;
    const policy = snapshot ? {
      policyId: snapshot.policyId, name: snapshot.name,
      categoryId: snapshot.categoryId, destinationScope: snapshot.destinationScope || "any",
      costsCenter: snapshot.costsCenter, dailyPerDiem: snapshot.dailyPerDiem,
      currency: snapshot.currency || "MXN",
      validFrom: snapshot.validFrom, validTo: snapshot.validTo, active: true,
    } : null;
    const caps = (snapshot?.caps || []).map((c) => ({ ...c, policyId: snapshot.policyId }));
    const approvedReceiptIds = request.policyExceptions
      .filter((ex) => ex.status === "APPROVED" && ex.receiptId)
      .map((ex) => ex.receiptId);

    const summary = summarizeRequestPolicyResult(request.receipts, caps, policy, {
      approvedExceptionReceiptIds: approvedReceiptIds,
    });
    return res.status(200).json(summary);
  } catch (e) { return handleError(res, e, "refund.requestSummary"); }
};
