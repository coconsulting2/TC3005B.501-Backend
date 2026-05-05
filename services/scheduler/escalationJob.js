/**
 * @module scheduler/escalationJob
 * @description Cron job de escalamiento N1→N2 a las 48h sin acción (M2-006 RF-35 absorbido).
 *   Idempotente: solicitudes ya escaladas (status=3) o terminales son ignoradas.
 */
import prisma from "../../database/config/prisma.js";
import { createNotification } from "../notificationService.js";

const HOURS_48_MS = 48 * 60 * 60 * 1000;

/**
 * Recorre Requests en status=2 con lastModDate > 48h y escala a status=3.
 * @returns {Promise<{ scanned: number, escalated: number }>}
 */
export async function runEscalationJob() {
  const cutoff = new Date(Date.now() - HOURS_48_MS);
  const candidates = await prisma.request.findMany({
    where: {
      requestStatusId: 2,
      lastModDate: { lt: cutoff },
    },
    select: {
      requestId: true,
      workflowPreSnapshot: true,
      userId: true,
    },
  });

  let escalated = 0;
  for (const req of candidates) {
    const snap = req.workflowPreSnapshot;
    const levels = snap && Array.isArray(snap.levels) ? snap.levels : [1, 2];
    if (!levels.includes(2)) continue; // sin N2 configurado, no se puede escalar

    const n2UserId = snap?.n2UserId ?? null;

    await prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { requestId: req.requestId },
        data: { requestStatusId: 3 },
      });
      await tx.solicitudHistorial.create({
        data: {
          requestId: req.requestId,
          userId: n2UserId ?? req.userId ?? 0,
          accion: "ESCALADO",
          comentario: "Escalamiento automático por 48h sin acción del aprobador N1.",
        },
      });
    });

    if (n2UserId) {
      await createNotification(
        n2UserId,
        `Solicitud #${req.requestId} escalada automáticamente a tu nivel por timeout de 48h.`
      ).catch(() => null);
    }

    escalated += 1;
  }

  return { scanned: candidates.length, escalated };
}
