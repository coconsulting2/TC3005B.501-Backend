/**
 * @file controllers/comprobantesController.js
 * @description Handles HTTP requests for CFDI comprobantes (M1-003).
 * @author Hector Lugo
 */
import { insertarCfdi, insertarComprobanteInternacional } from "../services/comprobantesService.js";
import ComprobantesModel from "../models/comprobantesModel.js";
import { parseCFDI, CfdiParseError, buildComprobanteRegistroBodyFromXml } from "../services/cfdiParserService.js";

const SAT_STATUS_MAP = Object.freeze({
  vigente: "vigente",
  cancelado: "cancelado",
});

const normalizeSatStatus = (satEstado) => {
  const key = String(satEstado || "").trim().toLowerCase();
  return SAT_STATUS_MAP[key] || "no_encontrado";
};

/**
 * POST /api/comprobantes/parse-xml
 * Devuelve RFC emisor, UUID, total y fecha para autollenar formularios (sin persistir).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {void}
 */
export const parseXmlComprobante = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "Archivo XML requerido" });
    }
    const xml = req.file.buffer.toString("utf-8");
    const data = parseCFDI(xml);
    const fechaLocal = new Date(data.fecha);
    const pad = (n) => String(n).padStart(2, "0");
    const local = `${fechaLocal.getFullYear()}-${pad(fechaLocal.getMonth() + 1)}-${pad(fechaLocal.getDate())}T${pad(fechaLocal.getHours())}:${pad(fechaLocal.getMinutes())}`;
    let registro_sugerido = null;
    try {
      registro_sugerido = buildComprobanteRegistroBodyFromXml(xml);
    } catch {
      registro_sugerido = null;
    }
    return res.status(200).json({
      rfc_emisor: data.rfcEmisor,
      fecha_emision: local,
      monto_total: data.total,
      uuid: data.uuid,
      registro_sugerido,
    });
  } catch (error) {
    if (error instanceof CfdiParseError) {
      return res.status(422).json({ error: error.message, code: error.code });
    }
    console.error("parseXmlComprobante:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/comprobantes/:receipt_id
 * Receives parsed CFDI 4.0 data + SAT Acuse, validates UUID uniqueness,
 * and inserts atomically into cfdi_comprobantes.
 *
 * @param {import('express').Request} req - params: receipt_id | body: CFDI 4.0 fields + Acuse SAT
 * @param {import('express').Response} res
 * @returns {void} 201 with created record, or 400/401/403/404/409/500
 */
export const crearComprobante = async (req, res) => {
  const receiptId = Number(req.params.receipt_id);
  try {
    const rawIntl = req.body?.is_international;
    const isIntl = rawIntl === true || rawIntl === "true";
    if (isIntl) {
      const cfdi = await insertarComprobanteInternacional(receiptId, req.body);
      return res.status(201).json(cfdi);
    }
    const cfdi = await insertarCfdi(receiptId, req.body);
    return res.status(201).json(cfdi);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Error in crearComprobante controller:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/comprobantes/:id/validacion-sat
 * Devuelve el ultimo estado SAT almacenado para el CFDI asociado al recibo.
 *
 * @param {import('express').Request} req - params: id
 * @param {import('express').Response} res
 * @returns {void}
 */
export const getValidacionSat = async (req, res) => {
  const receiptId = Number(req.params.id);
  try {
    const sat = await ComprobantesModel.getSatValidationByReceiptId(receiptId);
    if (!sat) {
      return res.status(404).json({ error: "No SAT validation found for this receipt" });
    }

    return res.status(200).json({
      status: normalizeSatStatus(sat.satEstado),
      verified_at: sat.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Error in getValidacionSat controller:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export default { crearComprobante, getValidacionSat, parseXmlComprobante };
