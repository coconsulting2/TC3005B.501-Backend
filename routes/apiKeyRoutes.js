/**
 * @file routes/apiKeyRoutes.js
 * @description Rutas admin para claves API por organización. Montadas en `/api/keys`.
 * `POST /generate` devuelve el secreto una sola vez; los demás endpoints nunca
 * exponen ni el secreto ni el hash.
 */
import express from "express";
import { body, param, query } from "express-validator";
import * as apiKeyController from "../controllers/apiKeyController.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { validateInputs } from "../middleware/validation.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

const validateOrgIdParam = [
  param("orgId").custom((v) => {
    try {
      const b = BigInt(v);
      if (b < 1n) {
        throw new Error("orgId must be positive");
      }
      return true;
    } catch {
      throw new Error("orgId must be a positive integer string");
    }
  }),
];

const validateGenerate = [
  body("name").isString().trim().isLength({ min: 1, max: 120 }).withMessage("name is required (1-120 chars)"),
  body("org_id").custom((v) => {
    try {
      const b = BigInt(v);
      if (b < 1n) {
        throw new Error("org_id must be positive");
      }
      return true;
    } catch {
      throw new Error("org_id must be a positive integer");
    }
  }),
  body("scope").isObject().withMessage("scope must be an object"),
  body("expires_at").isISO8601().withMessage("expires_at must be ISO 8601 date"),
];

const validateKeyIdParam = [
  param("id").isInt({ min: 1 }).toInt().withMessage("id must be a positive integer"),
];

const validateLogsQuery = [
  query("limit").optional().isInt({ min: 1, max: 200 }).toInt(),
  query("cursor").optional().isString().trim().matches(/^\d+$/).withMessage("cursor must be a numeric id"),
];

router.post(
  "/generate",
  generalRateLimiter,
  ...requirePermission("api_key:manage"),
  validateGenerate,
  validateInputs,
  apiKeyController.generateApiKey,
);

router.delete(
  "/:id/revoke",
  generalRateLimiter,
  ...requirePermission("api_key:manage"),
  validateKeyIdParam,
  validateInputs,
  apiKeyController.revokeApiKeyById,
);

router.get(
  "/org/:orgId",
  generalRateLimiter,
  ...requirePermission("api_key:manage"),
  validateOrgIdParam,
  validateInputs,
  apiKeyController.listApiKeysByOrg,
);

router.get(
  "/:id/logs",
  generalRateLimiter,
  ...requirePermission("api_key:manage"),
  validateKeyIdParam,
  validateLogsQuery,
  validateInputs,
  apiKeyController.listApiKeyLogs,
);

export default router;
