import express from "express";
import { body, param, validationResult } from "express-validator";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";
import {
  createApprovalSubstitute,
  deleteApprovalSubstitute,
  listApprovalSubstitutes,
} from "../controllers/approvalSubstituteController.js";

const router = express.Router();

const validateCreateBody = [
  body().custom((_v, { req }) => {
    const sid = req.body?.substitute_id ?? req.body?.substituteId;
    const vf = req.body?.valid_from ?? req.body?.validFrom;
    const vt = req.body?.valid_to ?? req.body?.validTo;
    if (!Number.isFinite(Number(sid)) || Number(sid) < 1) {
      throw new Error("substitute_id es obligatorio");
    }
    if (!vf || !vt) {
      throw new Error("valid_from y valid_to son obligatorios");
    }
    return true;
  }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0]?.msg || "Validación fallida" });
    }
    return next();
  },
];

const validateId = [
  param("id").isInt({ min: 1 }).withMessage("id inválido"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0]?.msg || "Validación fallida" });
    }
    return next();
  },
];

router.get(
  "/",
  generalRateLimiter,
  ...requirePermission("travel_request:authorize"),
  listApprovalSubstitutes,
);

router.post(
  "/",
  generalRateLimiter,
  ...requirePermission("travel_request:authorize"),
  validateCreateBody,
  createApprovalSubstitute,
);

router.delete(
  "/:id",
  generalRateLimiter,
  ...requirePermission("travel_request:authorize"),
  validateId,
  deleteApprovalSubstitute,
);

export default router;
