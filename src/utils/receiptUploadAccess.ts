/** Alineado con backend `requestReceiptUploadPolicy.js`: tras aprobación N2 (4) hasta validación CPP (7). */
export const MIN_STATUS_FOR_RECEIPT_UPLOAD = 4;
export const MAX_STATUS_FOR_RECEIPT_UPLOAD = 7;

export function requestAllowsReceiptUpload(statusId: number | string | undefined | null): boolean {
  const n = Number(statusId);
  return (
    Number.isFinite(n) &&
    n >= MIN_STATUS_FOR_RECEIPT_UPLOAD &&
    n <= MAX_STATUS_FOR_RECEIPT_UPLOAD
  );
}
