/**
 * @module policyExceptionService
 * @description Excepciones a políticas de viáticos solicitadas y resueltas (M2-006 RF-44, RF-45).
 *   Crear excepción: solicitante con justificación obligatoria (>=10 chars).
 *   Decidir: solo aprobador designado en Request.workflowPreSnapshot con permiso
 *   `expense:authorize_exception` (validado en middleware/route).
 */
import prisma from "../database/config/prisma.js";
import { createNotification } from "./notificationService.js";

const MIN_JUSTIFICATION_LEN = 10;

function authorizerIdsFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return [];
  const ids = [];
  if (snapshot.n1UserId) ids.push(Number(snapshot.n1UserId));
  if (snapshot.n2UserId) ids.push(Number(snapshot.n2UserId));
  return ids;
}

/**
 * Creates a PENDING exception and notifies designated approvers.
 * @param {{
 *   requestId: number,
 *   receiptId?: number,
 *   policyId?: number,
 *   capId?: number,
 *   amountClaimed: number,
 *   amountAllowed?: number,
 *   excessAmount: number,
 *   justification: string,
 *   requestedById: number
 * }} payload
 * @returns {Promise<Object>}
 */
export async function createException(payload) {
  if (!payload.justification || String(payload.justification).trim().length < MIN_JUSTIFICATION_LEN) {
    const err = new Error(`Justificación requerida (mínimo ${MIN_JUSTIFICATION_LEN} caracteres).`);
    err.status = 400;
    throw err;
  }
  if (!payload.requestId || !payload.requestedById) {
    const err = new Error("requestId y requestedById son requeridos.");
    err.status = 400;
    throw err;
  }

  const request = await prisma.request.findUnique({
    where: { requestId: Number(payload.requestId) },
    select: { requestId: true, workflowPreSnapshot: true, userId: true, organizationId: true },
  });
  if (!request) {
    const err = new Error(`Solicitud ${payload.requestId} no encontrada.`);
    err.status = 404;
    throw err;
  }

  const created = await prisma.policyException.create({
    data: {
      organizationId: request.organizationId,
      requestId: Number(payload.requestId),
      receiptId: payload.receiptId ? Number(payload.receiptId) : null,
      policyId: payload.policyId ? Number(payload.policyId) : null,
      capId: payload.capId ? Number(payload.capId) : null,
      amountClaimed: payload.amountClaimed,
      amountAllowed: payload.amountAllowed ?? null,
      excessAmount: payload.excessAmount,
      justification: String(payload.justification).trim(),
      status: "PENDING",
      requestedById: Number(payload.requestedById),
    },
  });

  const approvers = authorizerIdsFromSnapshot(request.workflowPreSnapshot);
  for (const userId of approvers) {
    await createNotification(
      userId,
      `Nueva excepción de política para solicitud #${request.requestId}: $${Number(payload.excessAmount).toFixed(2)} sobre el tope.`
    ).catch(() => null); // notificación no debe romper el flujo
  }

  return created;
}

/**
 * Decides an exception (APPROVED or REJECTED) and applies side effects:
 *   - APPROVED: marks Receipt.refund=true, inserts SolicitudHistorial APROBADO.
 *   - REJECTED: marks Receipt.refund=false, inserts SolicitudHistorial RECHAZADO.
 * Notifies the original requester.
 * Caller is responsible for verifying the actor has `expense:authorize_exception` permission
 * and is a designated approver (we additionally enforce the latter via workflowPreSnapshot).
 *
 * @param {number} exceptionId
 * @param {"APPROVED" | "REJECTED"} decision
 * @param {number} decidedById
 * @param {string} [decisionNote]
 * @returns {Promise<Object>}
 */
export async function decideException(exceptionId, decision, decidedById, decisionNote = null) {
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    const err = new Error("Decisión inválida; usar APPROVED o REJECTED.");
    err.status = 400;
    throw err;
  }
  const exception = await prisma.policyException.findUnique({
    where: { exceptionId: Number(exceptionId) },
    include: { request: { select: { workflowPreSnapshot: true, userId: true, organizationId: true } } },
  });
  if (!exception) {
    const err = new Error(`Excepción ${exceptionId} no encontrada.`);
    err.status = 404;
    throw err;
  }
  if (exception.status !== "PENDING") {
    const err = new Error("Esta excepción ya fue decidida y no puede modificarse.");
    err.status = 400;
    throw err;
  }

  const allowedApprovers = authorizerIdsFromSnapshot(exception.request.workflowPreSnapshot);
  if (allowedApprovers.length > 0 && !allowedApprovers.includes(Number(decidedById))) {
    const err = new Error("Solo los aprobadores designados de la solicitud pueden decidir esta excepción.");
    err.status = 403;
    throw err;
  }

  const accion = decision === "APPROVED" ? "APROBADO" : "RECHAZADO";
  const refundFlag = decision === "APPROVED";
  const note = decisionNote ? String(decisionNote).trim() : null;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.policyException.update({
      where: { exceptionId: Number(exceptionId) },
      data: {
        status: decision,
        decidedById: Number(decidedById),
        decidedAt: new Date(),
        decisionNote: note,
      },
    });
    if (exception.receiptId) {
      await tx.receipt.update({
        where: { receiptId: exception.receiptId },
        data: { refund: refundFlag },
      });
    }
    await tx.solicitudHistorial.create({
      data: {
        organizationId: exception.request.organizationId,
        requestId: exception.requestId,
        userId: Number(decidedById),
        accion,
        comentario: `Excepción #${exception.exceptionId} (${decision}). ` + (note ? `Nota: ${note}` : "Sin nota."),
      },
    });
    return row;
  });

  if (exception.request.userId) {
    const verb = decision === "APPROVED" ? "aprobada" : "rechazada";
    await createNotification(
      exception.request.userId,
      `Tu excepción de política para solicitud #${exception.requestId} fue ${verb}.`
    ).catch(() => null);
  }

  return updated;
}

/**
 * Lists pending exceptions for a given request.
 * @param {number} requestId
 * @returns {Promise<Array>}
 */
export async function listPendingForRequest(requestId) {
  return prisma.policyException.findMany({
    where: { requestId: Number(requestId), status: "PENDING" },
    orderBy: [{ createdAt: "asc" }],
  });
}

/**
 * Lists exceptions pending an approver decision. Filters by approver presence in
 * Request.workflowPreSnapshot. Does NOT enforce permission codes — that's the
 * route middleware's job.
 * @param {number} approverUserId
 * @returns {Promise<Array>}
 */
export async function listPendingForApprover(approverUserId) {
  const all = await prisma.policyException.findMany({
    where: { status: "PENDING" },
    include: {
      receipt: { select: { receiptId: true, amount: true, receiptType: { select: { receiptTypeName: true } } } },
      request: { select: { requestId: true, userId: true, workflowPreSnapshot: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });
  return all.filter((ex) => {
    const approvers = authorizerIdsFromSnapshot(ex.request.workflowPreSnapshot);
    return approvers.length === 0 || approvers.includes(Number(approverUserId));
  });
}
