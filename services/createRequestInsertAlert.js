/**
 * Efecto "AFTER INSERT Request" (ex-trigger CreateAlert).
 * Debe ejecutarse con el mismo cliente Prisma / transacción que insertó el Request,
 * si no la fila Request no es visible y falla Alert_request_id_fkey.
 *
 * @param {*} db - Cliente Prisma o `tx` de `$transaction`
 * @param {{ requestId: number, requestStatusId: number }} request
 */
export async function createRequestInsertAlert(db, request) {
  const statusId = request.requestStatusId;
  const alertMessage = await db.alertMessage.findUnique({
    where: { messageId: statusId },
  });
  if (!alertMessage) {
    return;
  }
  await db.alert.create({
    data: {
      requestId: request.requestId,
      messageId: statusId,
    },
  });
}
