/**
 * @file routes/policyRoutes.js
 * @description Rutas /api/policies + /api/employee-categories (M2-006).
 */
import express from "express";
import { body, param, validationResult } from "express-validator";
import {
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deactivatePolicy,
  previewReceipt,
} from "../controllers/policyController.js";
import {
  list as listCategories,
  create as createCategory,
  update as updateCategory,
  deactivate as deactivateCategory,
} from "../controllers/employeeCategoryController.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

const VALID_SCOPES = ["nacional", "internacional", "any"];
const VALID_CAP_UNITS = ["per_night", "per_trip", "per_day", "per_event"];

const checkErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const validateIdParam = [param("id").isInt({ min: 1 }).toInt(), checkErrors];

const validatePolicyPayload = [
  body("name").isString().trim().isLength({ min: 1, max: 120 }).withMessage("name requerido (1..120 chars)"),
  body("destinationScope").optional().isIn(VALID_SCOPES).withMessage(`destinationScope debe ser ${VALID_SCOPES.join("|")}`),
  body("validFrom").exists().withMessage("validFrom requerido")
    .custom((v) => !isNaN(new Date(v).getTime())).withMessage("validFrom inválido"),
  body("validTo").optional({ nullable: true })
    .custom((v) => v === null || !isNaN(new Date(v).getTime())).withMessage("validTo inválido"),
  body("dailyPerDiem").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("dailyPerDiem >= 0"),
  body("currency").optional().isString().isLength({ min: 3, max: 3 }),
  body("caps").optional().isArray(),
  body("caps.*.receiptTypeId").optional().isInt({ min: 1 }),
  body("caps.*.capAmount").optional().isFloat({ min: 0 }),
  body("caps.*.capUnit").optional().isIn(VALID_CAP_UNITS),
  checkErrors,
];

const validatePreviewPayload = [
  body("requestId").isInt({ min: 1 }).withMessage("requestId requerido"),
  body("receiptTypeId").isInt({ min: 1 }).withMessage("receiptTypeId requerido"),
  body("amount").isFloat({ min: 0 }).withMessage("amount requerido (>= 0)"),
  body("currency").optional().isString().isLength({ min: 3, max: 3 }),
  body("nights").optional().isInt({ min: 1 }),
  body("days").optional().isInt({ min: 1 }),
  checkErrors,
];

const validateCategoryPayload = [
  body("code").isString().trim().isLength({ min: 1, max: 40 }),
  body("name").isString().trim().isLength({ min: 1, max: 80 }),
  body("description").optional({ nullable: true }).isString().isLength({ max: 254 }),
  checkErrors,
];

// ============================================================================
// /api/policies
// ============================================================================
router.get("/",      generalRateLimiter, ...requirePermission("policy:read"),   listPolicies);
router.get("/:id",   generalRateLimiter, ...requirePermission("policy:read"),   validateIdParam, getPolicy);
router.post("/",     generalRateLimiter, ...requirePermission("policy:manage"), validatePolicyPayload, createPolicy);
router.put("/:id",   generalRateLimiter, ...requirePermission("policy:manage"), validateIdParam, validatePolicyPayload, updatePolicy);
router.delete("/:id", generalRateLimiter, ...requirePermission("policy:manage"), validateIdParam, deactivatePolicy);
router.post("/preview", generalRateLimiter, ...requirePermission("expense:submit"), validatePreviewPayload, previewReceipt);

export default router;

// ============================================================================
// /api/employee-categories — separate router
// ============================================================================
export const employeeCategoryRouter = (() => {
  const r = express.Router();
  r.get("/",      generalRateLimiter, ...requirePermission("policy:read"),   listCategories);
  r.post("/",     generalRateLimiter, ...requirePermission("policy:manage"), validateCategoryPayload, createCategory);
  r.put("/:id",   generalRateLimiter, ...requirePermission("policy:manage"), validateIdParam, validateCategoryPayload, updateCategory);
  r.delete("/:id", generalRateLimiter, ...requirePermission("policy:manage"), validateIdParam, deactivateCategory);
  return r;
})();
