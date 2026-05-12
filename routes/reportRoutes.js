/**
 * @file routes/reportRoutes.js
 * @description Rutas de reportes (gasto por centro de costos, etc.).
 */
import express from "express";
import { generalRateLimiter } from "../middleware/rateLimiters.js";
import { requireAnyPermission } from "../middleware/permissionMiddleware.js";
import { getExpensesByCostCenter } from "../controllers/expenseReportController.js";

const router = express.Router();

router.get(
  "/expenses-by-cc",
  generalRateLimiter,
  ...requireAnyPermission(
    "travel_request:view_any",
    "expense:view",
    "policy:manage"
  ),
  getExpensesByCostCenter
);

export default router;
