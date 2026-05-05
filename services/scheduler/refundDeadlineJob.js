/**
 * @module scheduler/refundDeadlineJob
 * @description Cron job que cierra solicitudes con plazo de comprobación vencido (M2-006 RF-39).
 *   Delega en reimbursementTimeService.lockExpiredRequests (idempotente).
 */
import { lockExpiredRequests } from "../reimbursementTimeService.js";

/**
 * @returns {Promise<{ scanned: number, locked: number }>}
 */
export async function runRefundDeadlineJob() {
  return lockExpiredRequests();
}
