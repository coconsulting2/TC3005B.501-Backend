/**
 * @file routes/externalApiKeyRoutes.js
 * @description Rutas para integradores ERP que autentican con `X-API-Key`
 * (o `Authorization: Bearer`). Cada respuesta deja traza en `api_key_logs`.
 */
import express from "express";
import { param, query } from "express-validator";
import {
  authenticateApiKey,
  apiKeyTenantContext,
  apiKeyAuditLog,
  requireApiKeyPermission,
} from "../middleware/apiKeyAuth.js";
import { applyRlsForRequest } from "../database/config/rlsConnection.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";
import { validateInputs } from "../middleware/validation.js";
import AccountingExportController from "../controllers/accountingExportController.js";

const router = express.Router();

const apiKeyChain = [
  authenticateApiKey,
  apiKeyTenantContext,
  applyRlsForRequest,
  apiKeyAuditLog,
];

const validateRequestId = [
  param("request_id").isInt({ min: 1 }).toInt().withMessage("request_id must be a positive integer"),
];

const validateRangeQuery = [
  query("from").isISO8601().withMessage("from must be ISO 8601 date"),
  query("to").isISO8601().withMessage("to must be ISO 8601 date"),
];

const validateContableQuery = [
  query("date_from").isISO8601().withMessage("date_from must be ISO 8601 date"),
  query("date_to").optional().isISO8601().withMessage("date_to must be ISO 8601 date"),
];

/**
 * GET /api/external/accounting/preview
 * Smoke test de autenticación (solo lectura).
 */
router.get(
  "/accounting/preview",
  generalRateLimiter,
  ...apiKeyChain,
  requireApiKeyPermission("accounting:export"),
  (req, res) => {
    res.status(200).json({
      ok: true,
      org_id: req.apiKey.organizationId.toString(),
      message: "read-only accounting integration preview",
    });
  },
);

/**
 * GET /api/external/accounting-export/:request_id
 * Polizas de un request finalizado (JSON o XML).
 */
router.get(
  "/accounting-export/:request_id",
  generalRateLimiter,
  ...apiKeyChain,
  requireApiKeyPermission("accounting:export"),
  validateRequestId,
  validateInputs,
  AccountingExportController.exportByRequest,
);

/**
 * GET /api/external/accounting-export?from=&to=
 * Polizas en rango de fechas.
 */
router.get(
  "/accounting-export",
  generalRateLimiter,
  ...apiKeyChain,
  requireApiKeyPermission("accounting:export"),
  validateRangeQuery,
  validateInputs,
  AccountingExportController.exportByRange,
);

/**
 * GET /api/external/export/contable?date_from=&date_to=&status=&format=
 * Alias ERP del endpoint `/api/export/contable`.
 */
router.get(
  "/export/contable",
  generalRateLimiter,
  ...apiKeyChain,
  requireApiKeyPermission("accounting:export"),
  validateContableQuery,
  validateInputs,
  AccountingExportController.exportContable,
);

export default router;
