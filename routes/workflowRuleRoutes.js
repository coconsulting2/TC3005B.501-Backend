/**
 * @file routes/workflowRuleRoutes.js
 * @description CRUD de reglas de workflow — solo Administrador de org (workflow:manage).
 */
import express from "express";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";
import {
  listRules,
  listDepartments,
  listRoles,
  previewRules,
  createRule,
  updateRule,
  toggleRule,
} from "../controllers/workflowRuleController.js";

const router = express.Router();

// Auxiliares para los selects del panel
router.get("/departments", generalRateLimiter, ...requirePermission("workflow:manage"), listDepartments);
router.get("/roles", generalRateLimiter, ...requirePermission("workflow:manage"), listRoles);

// CRUD de reglas
router.get("/", generalRateLimiter, ...requirePermission("workflow:manage"), listRules);
router.post("/preview", generalRateLimiter, ...requirePermission("workflow:manage"), previewRules);
router.post("/", generalRateLimiter, ...requirePermission("workflow:manage"), createRule);
router.put("/:id", generalRateLimiter, ...requirePermission("workflow:manage"), updateRule);
router.patch("/:id/toggle", generalRateLimiter, ...requirePermission("workflow:manage"), toggleRule);

export default router;
