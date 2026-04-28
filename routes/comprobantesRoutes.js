/**
 * @file routes/comprobantesRoutes.js
 * @description Routes for CFDI comprobantes (M1-003).
 * @author Hector Lugo
 */
import express from "express";
const router = express.Router();
import { crearComprobante, getValidacionSat } from "../controllers/comprobantesController.js";
import { validateId, validateCfdi, validateInputs } from "../middleware/validation.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

// POST /api/comprobantes/:receipt_id
// Permission: receipt:upload (granted to Solicitante, N1, N2)
router.route("/:receipt_id")
  .post(
    generalRateLimiter,
    ...requirePermission("receipt:upload"),
    validateId,
    validateCfdi,
    validateInputs,
    crearComprobante
  );

// GET /api/comprobantes/:id/validacion-sat
// Permission: receipt:view_sat (granted to Solicitante, N1, N2, Cuentas por pagar)
router.route("/:id/validacion-sat")
  .get(
    generalRateLimiter,
    ...requirePermission("receipt:view_sat"),
    validateId,
    validateInputs,
    getValidacionSat,
  );

export default router;
