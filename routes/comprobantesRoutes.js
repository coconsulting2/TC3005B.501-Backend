/**
 * @file routes/comprobantesRoutes.js
 * @description Routes for CFDI comprobantes (M1-003) + vista previa XML (TF-010).
 * @author Hector Lugo
 */
import express from "express";
const router = express.Router();
import {
  crearComprobante,
  getValidacionSat,
  parseXmlComprobante,
} from "../controllers/comprobantesController.js";
import { validateId, chooseComprobanteValidation, validateInputs } from "../middleware/validation.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";
import { upload, handleMulterError } from "../middleware/fileUpload.js";

// POST /api/comprobantes/parse-xml — vista previa RFC/UUID/monto (sin persistir)
router.post(
  "/parse-xml",
  generalRateLimiter,
  ...requirePermission("receipt:upload"),
  upload.single("xml"),
  parseXmlComprobante
);

// POST /api/comprobantes/:receipt_id
// Permission: receipt:upload (granted to Solicitante, N1, N2)
router.route("/:receipt_id")
  .post(
    generalRateLimiter,
    ...requirePermission("receipt:upload"),
    validateId,
    chooseComprobanteValidation,
    crearComprobante
  );

// GET /api/comprobantes/:id/validacion-sat
// Permission: receipt:view_sat (granted to Solicitante, N1, N2, Cuentas por pagar)
router.route("/:id/validacion-sat")
  .get(
    generalRateLimiter,
    ...requirePermission("receipt:view_sat"),
    validateId,
    validateInputs,
    getValidacionSat,
  );

router.use(handleMulterError);

export default router;
