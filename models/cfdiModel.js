/**
 * @module cfdiModel
 * @description Data access layer for CFDI-related queries on the Receipt table.
 * Handles UUID duplicate detection and storage of parsed CFDI metadata.
 */
import prisma from "../database/config/prisma.js";

const CfdiModel = {
  /**
   * Looks up a receipt by its CFDI UUID to detect duplicates.
   * @param {string} uuid - CFDI UUID in uppercase format (e.g. "A1B2C3D4-...")
   * @returns {Promise<{receiptId: number, cfdiUuid: string}|null>} Existing receipt or null
   */
  async findByCfdiUuid(uuid) {
    return await prisma.receipt.findUnique({
      where: { cfdiUuid: uuid },
      select: { receiptId: true, cfdiUuid: true },
    });
  },

  /**
   * Persists parsed CFDI metadata on an existing receipt record.
   * @param {number} receiptId - ID of the receipt to update
   * @param {{
   *   uuid: string,
   *   version: string,
   *   rfcEmisor: string,
   *   rfcReceptor: string|null,
   *   fecha: Date,
   *   total: number,
   *   taxes: Object
   * }} cfdiData - Parsed CFDI fields
   * @returns {Promise<import('@prisma/client').Receipt>} Updated receipt record
   */
  async saveCfdiMetadata(receiptId, cfdiData) {
    return await prisma.receipt.update({
      where: { receiptId: Number(receiptId) },
      data: {
        cfdiUuid: cfdiData.uuid,
        cfdiVersion: cfdiData.version,
        cfdiEmisorRfc: cfdiData.rfcEmisor,
        cfdiReceptorRfc: cfdiData.rfcReceptor,
        cfdiFecha: cfdiData.fecha,
        cfdiTotal: cfdiData.total,
        cfdiImpuestos: JSON.stringify(cfdiData.taxes),
      },
    });
  },
};

export default CfdiModel;
