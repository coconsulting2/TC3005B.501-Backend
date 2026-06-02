/**
 * @file routes/chartOfAccountRoutes.js
 * @description Rutas /api/chart-of-accounts — CRUD del catálogo contable maestro por organización (US-24).
 *   Lecturas: accounting_catalog:read. Escrituras: accounting_catalog:write.
 */
import express from "express";
import { body, param, validationResult } from "express-validator";
import {
  list,
  get,
  create,
  update,
  deactivate,
} from "../controllers/chartOfAccountController.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

const checkErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const validateIdParam = [param("id").isInt({ min: 1 }).toInt(), checkErrors];

const validateCreatePayload = [
  body("accountCode").isString().trim().isLength({ min: 1, max: 40 }).withMessage("accountCode requerido (1..40)"),
  body("accountName").isString().trim().isLength({ min: 1, max: 200 }).withMessage("accountName requerido (1..200)"),
  body("accountType").isString().trim().isLength({ min: 1, max: 40 }).withMessage("accountType requerido (1..40)"),
  body("parentAccountId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("parentAccountId inválido"),
  body("active").optional().isBoolean().withMessage("active debe ser booleano"),
  checkErrors,
];

const validateUpdatePayload = [
  body("accountName").optional().isString().trim().isLength({ min: 1, max: 200 }),
  body("accountType").optional().isString().trim().isLength({ min: 1, max: 40 }),
  body("parentAccountId").optional({ nullable: true }).isInt({ min: 1 }),
  body("active").optional().isBoolean(),
  checkErrors,
];

router.get("/",       generalRateLimiter, ...requirePermission("accounting_catalog:read"),  list);
router.get("/:id",    generalRateLimiter, ...requirePermission("accounting_catalog:read"),  validateIdParam, get);
router.post("/",      generalRateLimiter, ...requirePermission("accounting_catalog:write"), validateCreatePayload, create);
router.put("/:id",    generalRateLimiter, ...requirePermission("accounting_catalog:write"), validateIdParam, validateUpdatePayload, update);
router.delete("/:id", generalRateLimiter, ...requirePermission("accounting_catalog:write"), validateIdParam, deactivate);

export default router;
