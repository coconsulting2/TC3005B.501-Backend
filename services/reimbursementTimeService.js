/**
 * @module reimbursementTimeService
 * @description Plazo configurable de comprobación de gastos (M2-006 RF-37, RF-39).
 *   Default 14 días desde Request.tripEndDate. blockOnExpiry controla si
 *   `assertCanSubmitReceipts` y el cron `refundDeadlineJob` bloquean al vencer.
 */
import prisma from "../database/config/prisma.js";

const DEFAULT_DAYS_AFTER_TRIP = 14;
const DEFAULT_GRACE_DAYS = 0;
const DEFAULT_BLOCK_ON_EXPIRY = true;

const TERMINAL_STATUS_IDS = [8, 9, 10]; // Finalizado, Cancelado, Rechazado

/**
 * Returns the default time-limit row shape when a row does not exist for an org.
 * Does NOT include organizationId because BigInt is not JSON-serializable by default
 * and the controller does not need it back.
 * @returns {{ daysAfterTrip: number, graceDays: number, blockOnExpiry: boolean, active: boolean }}
 */
function defaultLimit() {
  return {
    daysAfterTrip: DEFAULT_DAYS_AFTER_TRIP,
    graceDays: DEFAULT_GRACE_DAYS,
    blockOnExpiry: DEFAULT_BLOCK_ON_EXPIRY,
    active: true,
  };
}

/**
 * Reads the time-limit configuration for an organization.
 * Returns defaults (14d / 0 grace / blockOnExpiry=true) when no row exists.
 * @param {bigint | number} organizationId
 * @returns {Promise<{ daysAfterTrip: number, graceDays: number, blockOnExpiry: boolean, active: boolean }>}
 */
export async function getOrgTimeLimit(organizationId) {
  const row = await prisma.reimbursementTimeLimit.findUnique({ where: { organizationId } });
  if (!row) return defaultLimit();
  return {
    daysAfterTrip: row.daysAfterTrip,
    graceDays: row.graceDays,
    blockOnExpiry: row.blockOnExpiry,
    active: row.active,
  };
}

/**
 * Upserts the time-limit configuration. Idempotent.
 * @param {bigint | number} organizationId
 * @param {{ daysAfterTrip?: number, graceDays?: number, blockOnExpiry?: boolean, active?: boolean }} payload
 * @param {number | null} [updatedById]
 */
export async function setOrgTimeLimit(organizationId, payload, updatedById = null) {
  const data = {
    daysAfterTrip: payload.daysAfterTrip ?? DEFAULT_DAYS_AFTER_TRIP,
    graceDays: payload.graceDays ?? DEFAULT_GRACE_DAYS,
    blockOnExpiry: payload.blockOnExpiry ?? DEFAULT_BLOCK_ON_EXPIRY,
    active: payload.active ?? true,
    updatedById,
  };
  return prisma.reimbursementTimeLimit.upsert({
    where: { organizationId },
    update: data,
    create: { organizationId, ...data },
  });
}

/**
 * Returns the deadline (Date) computed from a tripEndDate using the org config.
 * @param {Date | string} tripEndDate
 * @param {bigint | number} organizationId
 * @returns {Promise<{ deadline: Date, gracePeriodEnd: Date, daysAfterTrip: number, graceDays: number }>}
 */
export async function computeDeadline(tripEndDate, organizationId) {
  const limit = await getOrgTimeLimit(organizationId);
  const base = tripEndDate instanceof Date ? new Date(tripEndDate) : new Date(tripEndDate);

  const deadline = new Date(base);
  deadline.setUTCDate(deadline.getUTCDate() + limit.daysAfterTrip);
  deadline.setUTCHours(23, 59, 59, 999);

  const gracePeriodEnd = new Date(deadline);
  if (limit.graceDays > 0) {
    gracePeriodEnd.setUTCDate(gracePeriodEnd.getUTCDate() + limit.graceDays);
  }

  return { deadline, gracePeriodEnd, daysAfterTrip: limit.daysAfterTrip, graceDays: limit.graceDays };
}

/**
 * Checks if a request is within its reimbursement deadline.
 * Returns true when tripEndDate is null (cannot evaluate) or when within grace window.
 * @param {number} requestId
 * @returns {Promise<boolean>}
 */
export async function isWithinDeadline(requestId) {
  const req = await prisma.request.findUnique({
    where: { requestId: Number(requestId) },
    select: { requestId: true, tripEndDate: true, user: { select: { organizationId: true } } },
  });
  if (!req || !req.tripEndDate || !req.user || !req.user.organizationId) return true;

  const { gracePeriodEnd } = await computeDeadline(req.tripEndDate, req.user.organizationId);
  return new Date() <= gracePeriodEnd;
}

/**
 * Throws { status: 403 } when the request is past its reimbursement deadline
 * AND the org configuration has blockOnExpiry=true.
 * Used as defense-in-depth alongside the cron `refundDeadlineJob`.
 * @param {number} requestId
 * @throws {{ status: number, message: string }}
 */
export async function assertCanSubmitReceipts(requestId) {
  const req = await prisma.request.findUnique({
    where: { requestId: Number(requestId) },
    select: { requestId: true, tripEndDate: true, user: { select: { organizationId: true } } },
  });
  if (!req || !req.tripEndDate || !req.user || !req.user.organizationId) return;

  const limit = await getOrgTimeLimit(req.user.organizationId);
  if (!limit.blockOnExpiry) return;

  const { gracePeriodEnd, daysAfterTrip } = await computeDeadline(req.tripEndDate, req.user.organizationId);
  if (new Date() > gracePeriodEnd) {
    const err = new Error(
      `Plazo de reembolso vencido (${daysAfterTrip} días desde fin de viaje). ` +
      "Solicite extensión al administrador para continuar."
    );
    err.status = 403;
    throw err;
  }
}

/**
 * Locks (marks status=8 Finalizado) all requests whose deadline has passed
 * and that still have non-terminal status. Idempotent: requests already in a
 * terminal status are ignored. Inserts SolicitudHistorial entries as audit trail.
 * Used by the cron job refundDeadlineJob.
 * @returns {Promise<{ scanned: number, locked: number }>}
 */
export async function lockExpiredRequests() {
  const candidates = await prisma.request.findMany({
    where: {
      tripEndDate: { not: null },
      requestStatusId: { notIn: TERMINAL_STATUS_IDS },
    },
    select: {
      requestId: true,
      tripEndDate: true,
      requestStatusId: true,
      userId: true,
      user: { select: { organizationId: true, userId: true } },
    },
  });

  let locked = 0;
  for (const req of candidates) {
    if (!req.user || !req.user.organizationId || !req.tripEndDate) continue;
    const limit = await getOrgTimeLimit(req.user.organizationId);
    if (!limit.blockOnExpiry) continue;

    const { gracePeriodEnd, daysAfterTrip } = await computeDeadline(req.tripEndDate, req.user.organizationId);
    if (new Date() <= gracePeriodEnd) continue;

    await prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { requestId: req.requestId },
        data: { requestStatusId: 8 }, // Finalizado
      });
      await tx.solicitudHistorial.create({
        data: {
          requestId: req.requestId,
          userId: req.user.userId,
          accion: "RECHAZADO",
          comentario: `Cierre automático por plazo de reembolso vencido (${daysAfterTrip} días desde fin de viaje).`,
        },
      });
    });
    locked += 1;
  }

  return { scanned: candidates.length, locked };
}
