/**
 * Rutas POST /api/solicitudes/:id/aprobar|rechazar|reasignar (M2-005).
 */
import express from "express";
import { body, param, validationResult } from "express-validator";
import {
  approveSolicitud,
  rejectSolicitud,
  reassignSolicitud,
} from "../controllers/solicitudWorkflowController.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

const validateSolicitudId = [
  param("id")
    .isInt({ min: 1 })
    .toInt()
    .withMessage("ID de solicitud inválido"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];

const validateRechazarBody = [
  body().custom((_v, { req }) => {
    const c = req.body?.comentario ?? req.body?.comment;
    if (typeof c !== "string" || !String(c).trim()) {
      throw new Error("comentario es obligatorio");
    }
    return true;
  }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const msg = errors.array()[0]?.msg || "Validación fallida";
      return res.status(400).json({ error: msg });
    }
    next();
  },
];

const validateReasignarBody = [
  body().custom((_v, { req }) => {
    const uid = req.body?.userId ?? req.body?.user_id;
    if (uid == null || Number(uid) < 1) {
      throw new Error("userId es obligatorio");
    }
    const m = req.body?.motivo ?? req.body?.reason;
    if (typeof m !== "string" || !String(m).trim()) {
      throw new Error("motivo es obligatorio");
    }
    return true;
  }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const msg = errors.array()[0]?.msg || "Validación fallida";
      return res.status(400).json({ error: msg });
    }
    next();
  },
];

router.post(
  "/:id/aprobar",
  generalRateLimiter,
  ...requirePermission("travel_request:authorize"),
  validateSolicitudId,
  approveSolicitud,
);

router.post(
  "/:id/rechazar",
  generalRateLimiter,
  ...requirePermission("travel_request:authorize"),
  validateSolicitudId,
  validateRechazarBody,
  rejectSolicitud,
);

router.post(
  "/:id/reasignar",
  generalRateLimiter,
  ...requirePermission("travel_request:authorize"),
  validateSolicitudId,
  validateReasignarBody,
  reassignSolicitud,
);

export default router;
