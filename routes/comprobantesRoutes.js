/**
 * @file routes/comprobantesRoutes.js
 * @description Routes for CFDI comprobantes (M1-003).
 * @author Hector Lugo
 */
import express from "express";
const router = express.Router();
import { crearComprobante } from "../controllers/comprobantesController.js";
import { validateId, validateCfdi, validateInputs } from "../middleware/validation.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

// POST /api/comprobantes/:receipt_id
// Roles: Solicitante, N1, N2 (quienes generan comprobaciones de gastos)
router.route("/:receipt_id")
  .post(
    generalRateLimiter,
    ...requireAuth(["Solicitante", "N1", "N2"]),
    validateId,
    validateCfdi,
    validateInputs,
    crearComprobante
  );

export default router;
