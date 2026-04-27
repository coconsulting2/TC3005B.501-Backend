/**
 * @file controllers/comprobantesController.js
 * @description Handles HTTP requests for CFDI comprobantes (M1-003).
 * @author Hector Lugo
 */
import { insertarCfdi } from "../services/comprobantesService.js";
import ComprobantesModel from "../models/comprobantesModel.js";

const SAT_STATUS_MAP = Object.freeze({
  vigente: "vigente",
  cancelado: "cancelado",
});

const normalizeSatStatus = (satEstado) => {
  const key = String(satEstado || "").trim().toLowerCase();
  return SAT_STATUS_MAP[key] || "no_encontrado";
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

export default { crearComprobante, getValidacionSat };
