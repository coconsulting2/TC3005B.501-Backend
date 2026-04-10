/**
 * @file controllers/comprobantesController.js
 * @description Handles HTTP requests for CFDI comprobantes (M1-003).
 * @author Hector Lugo
 */
import { insertarCfdi } from "../services/comprobantesService.js";

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

export default { crearComprobante };
