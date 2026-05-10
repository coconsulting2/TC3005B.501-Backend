/**
 * @file routes/externalApiKeyRoutes.js
 * @description Rutas para integradores que autentican con `X-API-Key` (o `Authorization: Bearer`).
 * Cada respuesta deja traza en `api_key_logs`. Sirve como referencia para nuevas
 * integraciones (p. ej. solo lectura contable).
 */
import express from "express";
import {
  authenticateApiKey,
  apiKeyAuditLog,
  requireAnyApiKeyPermission,
} from "../middleware/apiKeyAuth.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

/**
 * GET /api/external/accounting/preview
 * Requiere scope.permissions con `accounting:export` o `accounts_payable:attend`.
 */
router.get(
  "/accounting/preview",
  generalRateLimiter,
  authenticateApiKey,
  apiKeyAuditLog,
  requireAnyApiKeyPermission("accounting:export", "accounts_payable:attend"),
  (req, res) => {
    res.status(200).json({
      ok: true,
      org_id: req.apiKey.orgId.toString(),
      message: "read-only accounting integration preview",
    });
  },
);

export default router;
