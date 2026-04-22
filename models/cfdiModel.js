/**
 * @module cfdiModel
 * @description CFDI UUID lookups against `cfdi_comprobantes` (tabla normalizada, alineada con M1-003).
 * El alta completa del CFDI + acuse SAT va en POST /api/comprobantes/:receipt_id (comprobantesModel).
 */
import prisma from "../database/config/prisma.js";

const CfdiModel = {
  /**
   * Detecta si el UUID (folio fiscal) ya está registrado en cfdi_comprobantes.
   * @param {string} uuid - UUID del TimbreFiscalDigital
   * @returns {Promise<{receiptId: number, uuid: string}|null>}
   */
  async findByCfdiUuid(uuid) {
    return await prisma.cfdiComprobante.findUnique({
      where: { uuid },
      select: { receiptId: true, uuid: true },
    });
  },

  /**
   * Busca por UUID sin depender del casing guardado en BD.
   * @param {string} uuid
   * @returns {Promise<{ receiptId: number; uuid: string } | null>}
   */
  async findByCfdiUuidInsensitive(uuid) {
    const u = String(uuid).trim();
    if (!u) return null;
    return prisma.cfdiComprobante.findFirst({
      where: { uuid: { equals: u, mode: "insensitive" } },
      select: { receiptId: true, uuid: true },
    });
  },
};

export default CfdiModel;
