/**
 * @module gastoTramoController
 * @description HTTP handlers for gasto_tramo endpoints.
 */
import GastoTramo from "../models/gastoTramoModel.js";

const ERROR_MAP = {
  VIAJE_NOT_FOUND: { status: 404, message: "Viaje no encontrado" },
  TRAMO_NOT_IN_VIAJE: { status: 404, message: "El tramo no pertenece al viaje indicado" },
  COMPROBANTE_NOT_FOUND: { status: 404, message: "Comprobante no encontrado" },
  COMPROBANTE_NOT_IN_VIAJE: { status: 422, message: "El comprobante no pertenece al viaje indicado" },
  COMPROBANTE_ALREADY_LINKED: { status: 409, message: "El comprobante ya está asociado a un tramo" },
};

/**
 * POST /viajes/:id/tramos/:tramo_id/gastos
 * Associates a receipt (comprobante) with a specific tramo of a viaje.
 * @param {import('express').Request} req - Express request (params: id, tramo_id; body: receipt_id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with gastoTramoId and message, or error
 */
export const createGastoTramo = async (req, res) => {
  const requestId = req.params.id;
  const routeId = req.params.tramo_id;
  const { receipt_id } = req.body;

  try {
    const result = await GastoTramo.createGastoTramo(requestId, routeId, receipt_id);
    return res.status(201).json(result);
  } catch (error) {
    const mapped = ERROR_MAP[error.message];
    if (mapped) {
      return res.status(mapped.status).json({ error: mapped.message });
    }
    console.error("Error in createGastoTramo controller:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /viajes/:id/resumen-tramos
 * Returns a consolidated accounting summary grouped by tramo with a grand total.
 * @param {import('express').Request} req - Express request (params: id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with tramos breakdown and total_general, or error
 */
export const getResumenTramos = async (req, res) => {
  const requestId = req.params.id;

  try {
    const resumen = await GastoTramo.getResumenTramos(requestId);
    return res.json(resumen);
  } catch (error) {
    if (error.message === "VIAJE_NOT_FOUND") {
      return res.status(404).json({ error: "Viaje no encontrado" });
    }
    console.error("Error in getResumenTramos controller:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export default { createGastoTramo, getResumenTramos };
