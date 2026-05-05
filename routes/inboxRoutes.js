/**
 * @file routes/inboxRoutes.js
 * @description GET /api/solicitudes/inbox — bandeja de aprobaciones backend (M2-007 dependency).
 *   Se monta en /api/solicitudes ANTES de solicitudWorkflowRoutes para que /inbox no
 *   colisione con la ruta /:id/aprobar (Express resuelve por orden).
 */
import express from "express";
import { getInbox } from "../controllers/inboxController.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.get("/inbox",
  generalRateLimiter,
  ...requirePermission("travel_request:authorize"),
  getInbox);

export default router;
