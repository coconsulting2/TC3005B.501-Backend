/**
 * Reglas de negocio: alta de comprobantes (PDF/XML, fila Receipt, CFDI)
 * solo después de que N2 haya aprobado (request_status_id >= 4).
 * Hasta validación de comprobantes (7); terminales 8–10 no permiten carga.
 */
import Applicant from "../models/applicantModel.js";

export const MIN_STATUS_FOR_RECEIPT_UPLOAD = 4;
export const MAX_STATUS_FOR_RECEIPT_UPLOAD = 7;

/**
 * @param {number|string} statusId
 * @returns {boolean}
 */
export function requestAllowsReceiptUpload(statusId) {
  const n = Number(statusId);
  return Number.isFinite(n) && n >= MIN_STATUS_FOR_RECEIPT_UPLOAD && n <= MAX_STATUS_FOR_RECEIPT_UPLOAD;
}

/**
 * @param {number} requestId
 * @throws {{ status: number, message: string }}
 */
export async function assertRequestAllowsReceiptUpload(requestId) {
  const status = await Applicant.getRequestStatus(Number(requestId));
  if (status === null || status === undefined) {
    const err = new Error(`No request found with id ${requestId}`);
    err.status = 404;
    throw err;
  }
  if (!requestAllowsReceiptUpload(status)) {
    const err = new Error(
      "No se pueden registrar comprobantes hasta que la solicitud haya sido aprobada por N2 (estado Cotización del Viaje o fases posteriores hasta validación de comprobantes)."
    );
    err.status = 403;
    throw err;
  }
}
