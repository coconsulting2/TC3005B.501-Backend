/**
 * @module accountsPayableModel
 * @description Data access layer for accounts payable queries using Prisma.
 */
import prisma from "../database/config/prisma.js";

const AccountsPayable = {
  /**
   * Update a travel request status and imposed fee.
   * @param {number} requestId - Identifier of the travel request.
   * @param {number} imposedFee - Imposed fee for the request.
   * @param {number} newStatus - New status identifier to set.
   * @returns {Promise<boolean>} True if the update succeeded.
   */
  async attendTravelRequest(requestId, imposedFee, newStatus) {
    await prisma.request.update({
      where: { requestId: Number(requestId) },
      data: {
        requestStatusId: Number(newStatus),
        imposedFee: Number(imposedFee),
      },
    });
    return true;
  },

  /**
   * Check if a request exists. Returns the request with hotel/plane info.
   * The controller checks hotel_needed_list.includes(1) and plane_needed_list.includes(1).
   * We replicate that shape by building comma-separated strings from route data.
   * @param {number} requestId - Identifier of the request to check.
   * @returns {Promise<Object|undefined>} Request record if found.
   */
  async requestExists(requestId) {
    const request = await prisma.request.findUnique({
      where: { requestId: Number(requestId) },
      include: {
        routeRequests: {
          include: { route: true },
        },
      },
    });

    if (!request) return undefined;

    // Build comma-separated lists matching the old GROUP_CONCAT output
    const hotelValues = request.routeRequests.map((rr) => rr.route?.hotelNeeded ? 1 : 0);
    const planeValues = request.routeRequests.map((rr) => rr.route?.planeNeeded ? 1 : 0);

    return {
      request_id: request.requestId,
      request_status_id: request.requestStatusId,
      hotel_needed_list: hotelValues.join(", "),
      plane_needed_list: planeValues.join(", "),
    };
  },

  /**
   * Get the validation statuses of receipts for a request.
   * @param {number} requestId - Identifier of the request.
   * @returns {Promise<Array<string>>} List of validation statuses.
   */
  async getReceiptStatusesForRequest(requestId) {
    const rows = await prisma.receipt.findMany({
      where: { requestId: Number(requestId) },
      select: { validation: true },
    });
    return rows.map((r) => r.validation);
  },

  /**
   * Update the status of a request.
   * @param {number} requestId - Identifier of the request to update.
   * @param {number} statusId - New status identifier to set.
   * @returns {Promise<void>}
   */
  async updateRequestStatus(requestId, statusId) {
    await prisma.request.update({
      where: { requestId: Number(requestId) },
      data: { requestStatusId: Number(statusId) },
    });
  },

  /**
   * Check if a receipt exists in the database.
   * @param {number} receiptId - Identifier of the receipt to check.
   * @returns {Promise<Object|undefined>} Receipt record if found.
   */
  async receiptExists(receiptId) {
    const receipt = await prisma.receipt.findUnique({
      where: { receiptId: Number(receiptId) },
      select: { receiptId: true, validation: true },
    });

    if (!receipt) return undefined;

    return {
      receipt_id: receipt.receiptId,
      validation: receipt.validation,
    };
  },

  /**
   * Recibo con CFDI para validacion CPP (aprobacion / rechazo).
   * @param {number} receiptId
   * @returns {Promise<{ receipt_id: number, validation: string, cfdiComprobante: Object|null }|undefined>}
   */
  async findReceiptForValidation(receiptId) {
    const receipt = await prisma.receipt.findUnique({
      where: { receiptId: Number(receiptId) },
      include: { cfdiComprobante: true },
    });
    if (!receipt) return undefined;
    return {
      receipt_id: receipt.receiptId,
      validation: receipt.validation,
      cfdiComprobante: receipt.cfdiComprobante,
    };
  },

  /**
   * Validate (approve or reject) a receipt.
   * The controller calls this with `3 - approval` which maps to:
   *   approval=1 -> 2 (Aprobado is index 2 in the old enum)
   *   approval=0 -> 3 (Rechazado is index 3 in the old enum)
   * We convert from that integer to the enum string.
   * @param {number} receiptId - Receipt ID.
   * @param {number} approval - Validation code (2=Aprobado, 3=Rechazado).
   * @returns {Promise<boolean>} True if updated.
   */
  async validateReceipt(receiptId, approval) {
    // Map the old integer-based enum indexing to string values
    const validationMap = { 1: "Pendiente", 2: "Aprobado", 3: "Rechazado" };
    const validationValue = validationMap[approval] || "Pendiente";

    await prisma.receipt.update({
      where: { receiptId: Number(receiptId) },
      data: { validation: validationValue },
    });
    return true;
  },

  /**
   * Get expense validations for a given request.
   * @param {number} requestId - Identifier of the request.
   * @returns {Promise<Object>} Structured expense validation summary.
   */
  async getExpenseValidations(requestId) {
    const rows = await prisma.receipt.findMany({
      where: { requestId: Number(requestId) },
      include: { receiptType: true, cfdiComprobante: true },
    });

    if (rows.length === 0) {
      return {
        request_id: requestId,
        Expenses: [],
      };
    }

    const hasPendingValidation = rows.some((row) => row.validation === "Pendiente");
    const expense_status = hasPendingValidation ? "Pendiente" : "Sin Pendientes";

    const statusOrder = { Pendiente: 1, Rechazado: 2, Aprobado: 3 };
    rows.sort((a, b) => statusOrder[a.validation] - statusOrder[b.validation]);

    return {
      request_id: requestId,
      status: expense_status,
      Expenses: rows.map((row) => ({
        receipt_id: row.receiptId,
        receipt_type_name: row.receiptType?.receiptTypeName,
        amount: row.amount,
        validation: row.validation,
        sat_estado: row.cfdiComprobante?.satEstado ?? null,
        pdf_id: row.pdfFileId,
        pdf_name: row.pdfFileName,
        xml_id: row.xmlFileId,
        xml_name: row.xmlFileName,
      })),
    };
  },
};

export default AccountsPayable;
