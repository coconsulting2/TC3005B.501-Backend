/**
 * @file models/comprobantesModel.js
 * @description Data access layer for CFDI 4.0 comprobantes.
 * @author Hector Lugo
 */
import prisma from "../database/config/prisma.js";

const ComprobantesModel = {
  /**
   * Find a CFDI by its UUID (Folio Fiscal).
   * Used to enforce uniqueness before insert.
   * @param {string} uuid - UUID v4 from the TimbreFiscalDigital
   * @returns {Promise<Object|null>}
   */
  async findByUUID(uuid) {
    return prisma.cfdiComprobante.findUnique({ where: { uuid } });
  },

  /**
   * Verify that a Receipt exists before associating a CFDI to it.
   * @param {number} receiptId
   * @returns {Promise<Object|null>}
   */
  async findReceiptById(receiptId) {
    return prisma.receipt.findUnique({ where: { receiptId } });
  },

  /**
   * Obtiene el ultimo estado SAT del CFDI ligado al recibo.
   * @param {number} receiptId
   * @returns {Promise<{satEstado: string, createdAt: Date}|null>}
   */
  async getSatValidationByReceiptId(receiptId) {
    return prisma.cfdiComprobante.findUnique({
      where: { receiptId: Number(receiptId) },
      select: {
        satEstado: true,
        createdAt: true,
      },
    });
  },

  /**
   * Actualiza solo los campos de acuse SAT para el CFDI ligado al recibo.
   * @param {number} receiptId
   * @param {Object} data - sat_codigo_estatus, sat_estado, sat_es_cancelable, sat_estatus_cancelacion, sat_validacion_efos
   * @returns {Promise<Object|null>}
   */
  async updateSatAcuseByReceiptId(receiptId, data) {
    const row = await prisma.cfdiComprobante.findUnique({
      where: { receiptId: Number(receiptId) },
    });
    if (!row) {
      return null;
    }
    return prisma.cfdiComprobante.update({
      where: { receiptId: Number(receiptId) },
      data: {
        satCodigoEstatus:        data.sat_codigo_estatus,
        satEstado:               data.sat_estado,
        satEsCancelable:         data.sat_es_cancelable ?? null,
        satEstatusCancelacion:   data.sat_estatus_cancelacion ?? null,
        satValidacionEfos:       data.sat_validacion_efos,
      },
    });
  },

  /**
   * Insert a new CfdiComprobante linked to a Receipt atomically.
   * Uses prisma.$transaction to guarantee full rollback on any failure.
   * @param {number} receiptId
   * @param {Object} data - Parsed CFDI 4.0 fields + SAT Acuse response
   * @returns {Promise<Object>} Created CfdiComprobante record
   */
  async createCfdi(receiptId, data) {
    return prisma.$transaction(async (tx) => {
      return tx.cfdiComprobante.create({
        data: {
          receiptId,
          // --- TimbreFiscalDigital ---
          uuid:                    data.uuid,
          fechaTimbrado:           new Date(data.fecha_timbrado),
          rfcPac:                  data.rfc_pac,
          // --- Comprobante ---
          version:                 data.version ?? "4.0",
          serie:                   data.serie ?? null,
          folio:                   data.folio ?? null,
          fechaEmision:            new Date(data.fecha_emision),
          tipoComprobante:         data.tipo_comprobante,
          lugarExpedicion:         data.lugar_expedicion,
          exportacion:             data.exportacion ?? "01",
          metodoPago:              data.metodo_pago,
          formaPago:               data.forma_pago,
          moneda:                  data.moneda ?? "MXN",
          tipoCambio:              data.tipo_cambio ?? 1.0,
          subtotal:                data.subtotal,
          descuento:               data.descuento ?? 0.0,
          iva:                     data.iva ?? 0.0,
          total:                   data.total,
          // --- Emisor ---
          rfcEmisor:               data.rfc_emisor,
          nombreEmisor:            data.nombre_emisor,
          regimenFiscalEmisor:     data.regimen_fiscal_emisor,
          // --- Receptor ---
          rfcReceptor:             data.rfc_receptor,
          nombreReceptor:          data.nombre_receptor,
          domicilioFiscalReceptor: data.domicilio_fiscal_receptor,
          regimenFiscalReceptor:   data.regimen_fiscal_receptor,
          usoCfdi:                 data.uso_cfdi,
          // --- Acuse SAT ---
          satCodigoEstatus:        data.sat_codigo_estatus,
          satEstado:               data.sat_estado,
          satEsCancelable:         data.sat_es_cancelable ?? null,
          satEstatusCancelacion:   data.sat_estatus_cancelacion ?? null,
          satValidacionEfos:       data.sat_validacion_efos,
        },
      });
    });
  },
};

export default ComprobantesModel;
