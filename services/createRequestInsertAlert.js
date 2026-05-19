/**
 * Efecto "AFTER INSERT Request" (ex-trigger CreateAlert).
 * Debe ejecutarse con el mismo cliente Prisma / transacción que insertó el Request,
 * si no la fila Request no es visible y falla Alert_request_id_fkey.
 *
 * @param {*} db - Cliente Prisma o `tx` de `$transaction`
 * @param {{ requestId: number, requestStatusId: number, organizationId: bigint|number }} request
 */
import { findAlertMessageIdForRequestStatus } from "./alertMessageResolver.js";

export async function createRequestInsertAlert(db, request) {
  const statusId = request.requestStatusId;
  const messageId = await findAlertMessageIdForRequestStatus(
    db,
    request.organizationId,
    statusId,
  );
  if (!messageId) {
    console.warn(
      `[createRequestInsertAlert] Sin AlertMessage para org=${request.organizationId} status=${statusId}`,
    );
    return;
  }
  await db.alert.create({
    data: {
      requestId: request.requestId,
      messageId,
      organizationId: BigInt(request.organizationId),
    },
  });
}
