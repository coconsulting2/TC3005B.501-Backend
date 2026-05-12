/**
 * @file exportRoutes.js
 * @description Rutas para la exportacion contable al ERP (M1-010).
 * Montado en /api/export por app.js.
 *
 * Endpoints:
 *   GET /api/export/contable?date_from=YYYY-MM-DD[&date_to=YYYY-MM-DD][&status=Sincronizado][&format=xml|json]
 */
import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";
import AccountingExportController from "../controllers/accountingExportController.js";

const router = express.Router();

/**
 * GET /api/export/contable
 * Genera la poliza contable estructurada (JSON o XML) lista para integrarse a SAP.
 * Solo accesible para el rol "Cuentas por pagar".
 *
 * Query params:
 *   date_from  {string}  YYYY-MM-DD  Inicio del rango (obligatorio).
 *   date_to    {string}  YYYY-MM-DD  Fin del rango (opcional, default: hoy).
 *   status     {string}  "Sincronizado" para incluir registros ya exportados (force mode).
 *   format     {string}  "json" (default) | "xml"
 */
router.get(
    "/contable",
    generalRateLimiter,
    ...requireAuth(["Cuentas por pagar"]),
    AccountingExportController.exportContable,
);

export default router;
