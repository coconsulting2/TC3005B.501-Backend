/*
 * Gasto Tramo Routes
 * POST /viajes/:id/tramos/:tramo_id/gastos  — Associate a comprobante to a tramo
 * GET  /viajes/:id/resumen-tramos           — Consolidated accounting summary by tramo
 */
import express from "express";
const router = express.Router();
import { createGastoTramo, getResumenTramos } from "../controllers/gastoTramoController.js";
import { validateViajeId, validateViajeTramoIds, validateGastoTramoBody, validateInputs } from "../middleware/validation.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

router.route("/:id/tramos/:tramo_id/gastos")
  .post(
    generalRateLimiter,
    ...requirePermission("receipt:upload"),
    validateViajeTramoIds,
    validateGastoTramoBody,
    validateInputs,
    createGastoTramo,
  );

router.route("/:id/resumen-tramos")
  .get(
    generalRateLimiter,
    ...requirePermission("expense:view"),
    validateViajeId,
    validateInputs,
    getResumenTramos,
  );

export default router;
