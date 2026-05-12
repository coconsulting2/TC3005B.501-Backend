/**
 * @file controllers/expenseReportController.js
 * @description Handler GET expenses-by-cc (reporte por centro de costo).
 */
import prisma from "../database/config/prisma.js";
import { buildExpensesByCostCenterReport } from "../services/expenseReportService.js";

/**
 * GET /api/reports/expenses-by-cc
 * @type {import("express").RequestHandler}
 */
export async function getExpensesByCostCenter(req, res, next) {
  try {
    const orgId = req.tenant?.organizationId;
    if (orgId == null) {
      return res.status(400).json({
        error: "No hay organización en contexto. Inicia sesión de nuevo o elige una organización (impersonación).",
      });
    }
    const data = await buildExpensesByCostCenterReport(prisma, req.query, orgId);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}
