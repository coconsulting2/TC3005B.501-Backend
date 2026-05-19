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
    const permissionSet = req.user?.permissionSet;
    const actorUserId = Number(req.user?.user_id);
    const orgWide =
      permissionSet instanceof Set &&
      (permissionSet.has("travel_request:view_any") ||
        permissionSet.has("policy:manage"));

    const data = await buildExpensesByCostCenterReport(
      prisma,
      req.query,
      orgId,
      orgWide
        ? { scope: "organization" }
        : { scope: "team", actorUserId },
    );
    return res.json(data);
  } catch (err) {
    next(err);
  }
}
