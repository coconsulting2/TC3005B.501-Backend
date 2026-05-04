/**
 * @file routes/refundRoutes.js
 * @description Rutas /api/refunds — plazo, excepciones, dashboard usuario, summary (M2-006).
 */
import express from "express";
import { body, param, validationResult } from "express-validator";
import {
  getTimeLimit,
  setTimeLimit,
  createException,
  decideException,
  listPendingExceptions,
  getRefundDashboardByUser,
  getRequestSummary,
} from "../controllers/refundController.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

const checkErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

const validateTimeLimitPayload = [
  body("daysAfterTrip").optional().isInt({ min: 1, max: 365 }),
  body("graceDays").optional().isInt({ min: 0, max: 30 }),
  body("blockOnExpiry").optional().isBoolean(),
  checkErrors,
];

const validateExceptionPayload = [
  body("requestId").isInt({ min: 1 }),
  body("receiptId").optional({ nullable: true }).isInt({ min: 1 }),
  body("policyId").optional({ nullable: true }).isInt({ min: 1 }),
  body("capId").optional({ nullable: true }).isInt({ min: 1 }),
  body("amountClaimed").isFloat({ min: 0 }),
  body("amountAllowed").optional({ nullable: true }).isFloat({ min: 0 }),
  body("excessAmount").isFloat({ min: 0 }),
  body("justification").isString().trim().isLength({ min: 10 })
    .withMessage("Justificación requerida (mínimo 10 caracteres)"),
  checkErrors,
];

const validateDecidePayload = [
  body("decision").isIn(["APPROVED", "REJECTED"]).withMessage("decision debe ser APPROVED o REJECTED"),
  body("decisionNote").optional({ nullable: true }).isString(),
  checkErrors,
];

router.get("/time-limit",          generalRateLimiter, ...requirePermission("policy:read"),                getTimeLimit);
router.put("/time-limit",          generalRateLimiter, ...requirePermission("policy:manage"), validateTimeLimitPayload, setTimeLimit);

router.get("/exceptions/pending",  generalRateLimiter, ...requirePermission("expense:authorize_exception"), listPendingExceptions);
router.post("/exceptions",         generalRateLimiter, ...requirePermission("expense:submit"),              validateExceptionPayload, createException);
router.post("/exceptions/:id/decide",
  generalRateLimiter, ...requirePermission("expense:authorize_exception"),
  param("id").isInt({ min: 1 }), validateDecidePayload, checkErrors, decideException);

router.get("/by-user/:userId",
  generalRateLimiter, ...requirePermission("travel_request:view_own"),
  param("userId").isInt({ min: 1 }), checkErrors, getRefundDashboardByUser);

router.get("/request/:requestId/summary",
  generalRateLimiter, ...requirePermission("travel_request:view_any"),
  param("requestId").isInt({ min: 1 }), checkErrors, getRequestSummary);

export default router;
