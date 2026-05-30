/**
 * @module alertMessageResolver
 * @description Resuelve AlertMessage por texto de catálogo (multi-tenant).
 *   Los message_id autoincrementales NO coinciden con request_status_id.
 */

/** Textos alineados con DEFAULT_ALERT_MESSAGES en bootstrapOrganization.js */
export const REQUEST_STATUS_ALERT_TEXT = Object.freeze({
  1: "Se ha abierto una solicitud.",
  2: "Se requiere tu revisión para Primera Revisión.",
  3: "Se requiere tu revisión para Segunda Revisión.",
  4: "La solicitud está lista para generar su cotización de viaje.",
  5: "Se deben asignar los servicios del viaje para la solicitud.",
  6: "Se requiere validar comprobantes de los gastos del viaje.",
  7: "Los comprobantes están listos para validación.",
});

/**
 * @param {*} db - Prisma client o tx
 * @param {bigint|number} organizationId
 * @param {number} requestStatusId
 * @returns {Promise<number|null>}
 */
export async function findAlertMessageIdForRequestStatus(
  db,
  organizationId,
  requestStatusId,
) {
  const text = REQUEST_STATUS_ALERT_TEXT[requestStatusId];
  if (!text) return null;

  const row = await db.alertMessage.findFirst({
    where: {
      organizationId: BigInt(organizationId),
      messageText: text,
    },
    select: { messageId: true },
  });

  return row?.messageId ?? null;
}
