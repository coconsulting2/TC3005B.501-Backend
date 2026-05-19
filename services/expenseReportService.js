/**
 * @file services/expenseReportService.js
 * @description Agrega comprobantes (Receipt) por centro de costo y periodo para el
 *   dashboard M3-009. Usa el departamento del solicitante de la solicitud como CC.
 *
 *   Alcance:
 *   - `organization`: CxP / admin (`travel_request:view_any`, `policy:manage`).
 *   - `team`: N1/N2 con `expense:view` — solo subordinados (árbol `manager_user_id`).
 */

import { getSubordinatesRecursive } from "./employeeHierarchyService.js";

/** @typedef {import('@prisma/client').PrismaClient} PrismaClient */

/**
 * @typedef {'organization'|'team'} ReportScope
 * @typedef {{ scope?: ReportScope, actorUserId?: number }} ReportScopeOpts
 */

/** IDs de estatus de solicitud (seed global `Request_status`). */
const REQUEST_STATUS_FINALIZADO = 8;

const UNASSIGNED_CC_ID = -1;

/**
 * @param {string|null|undefined} receiptTypeName
 * @returns {string}
 */
export function mapReceiptTypeToReportCategory(receiptTypeName) {
  if (!receiptTypeName) return "OTROS";
  const n = receiptTypeName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (n.includes("vuelo") || n.includes("viaje")) return "VIAJE_NACIONAL";
  if (n.includes("hosped") || n.includes("hotel")) return "HOSPEDAJE";
  if (n.includes("comida") || n.includes("aliment")) return "ALIMENTOS";
  if (
    n.includes("transport") ||
    n.includes("caseta") ||
    n.includes("autobus") ||
    n.includes("taxi")
  ) {
    return "TRANSPORTE";
  }
  return "OTROS";
}

/**
 * @param {import("@prisma/client").ValidationStatus} validation
 * @param {number|null|undefined} requestStatusId
 * @returns {"draft"|"submitted"|"approved"|"rejected"|"paid"}
 */
export function mapValidationToReportStatus(validation, requestStatusId) {
  if (validation === "Rechazado") return "rejected";
  if (validation === "Pendiente") return "submitted";
  if (validation === "Aprobado") {
    if (requestStatusId === REQUEST_STATUS_FINALIZADO) return "paid";
    return "approved";
  }
  return "submitted";
}

/**
 * @param {Date} d
 * @param {"monthly"|"quarterly"} period
 * @returns {string}
 */
function periodKeyForDate(d, period) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (period === "quarterly") {
    const q = Math.floor(m / 3) + 1;
    return `${y}-Q${q}`;
  }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * @param {unknown} q
 * @returns {string[]}
 */
function queryAsStringList(q) {
  if (q == null || q === "") return [];
  return Array.isArray(q) ? q.map(String) : [String(q)];
}

/**
 * @param {unknown} q
 * @returns {number[]}
 */
function queryAsIntList(q) {
  const raw = queryAsStringList(q);
  return raw
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
}

/**
 * @param {object} query - req.query
 * @param {bigint} organizationId
 * @param {PrismaClient} prisma
 * @param {ReportScopeOpts} [scopeOpts]
 */
export async function buildExpensesByCostCenterReport(
  prisma,
  query,
  organizationId,
  scopeOpts = {},
) {
  const period = query.period === "quarterly" ? "quarterly" : "monthly";
  const fromStr = typeof query.from === "string" ? query.from : "";
  const toStr = typeof query.to === "string" ? query.to : "";
  const fromDate = fromStr ? new Date(`${fromStr}T00:00:00.000Z`) : null;
  const toDate = toStr ? new Date(`${toStr}T23:59:59.999Z`) : null;

  const filterExpenseTypes = new Set(queryAsStringList(query.expenseType));
  const filterStatuses = new Set(queryAsStringList(query.status));
  const filterCcIds = queryAsIntList(query.costCenterId);

  const orgId = organizationId;
  const scope = scopeOpts.scope === "team" ? "team" : "organization";

  /** @type {number[]|null} */
  let teamUserIds = null;
  if (scope === "team" && scopeOpts.actorUserId != null) {
    const actor = Number(scopeOpts.actorUserId);
    if (Number.isFinite(actor) && actor > 0) {
      teamUserIds = await getSubordinatesRecursive(actor);
    } else {
      teamUserIds = [];
    }
  }

  const dateFilter =
    fromDate && toDate && !Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())
      ? { gte: fromDate, lte: toDate }
      : undefined;

  const receipts = await prisma.receipt.findMany({
    where: {
      organizationId: orgId,
      requestId: { not: null },
      ...(teamUserIds
        ? { request: { userId: { in: teamUserIds } } }
        : {}),
      ...(dateFilter ? { submissionDate: dateFilter } : {}),
    },
    include: {
      receiptType: true,
      request: {
        include: {
          user: {
            include: { department: true },
          },
        },
      },
    },
    orderBy: { submissionDate: "asc" },
  });

  /** @type {import("@prisma/client").Department[]} */
  const departments = await prisma.department.findMany({
    where: { organizationId: orgId, active: true, costsCenter: { not: null } },
    select: {
      departmentId: true,
      costsCenter: true,
      departmentName: true,
    },
  });

  const budgets = departments.map((d) => ({
    cost_center_id: d.departmentId,
    cost_center_code: d.costsCenter ?? "",
    cost_center_name: d.departmentName,
    budget: 0,
    spent: 0,
  }));

  const rows = [];

  for (const r of receipts) {
    const req = r.request;
    if (!req) continue;

    const dept = req.user?.department;
    let cost_center_id;
    let cost_center_code;
    let cost_center_name;
    if (dept && dept.costsCenter) {
      cost_center_id = dept.departmentId;
      cost_center_code = dept.costsCenter;
      cost_center_name = dept.departmentName;
    } else {
      cost_center_id = UNASSIGNED_CC_ID;
      cost_center_code = "—";
      cost_center_name = "Sin centro de costos";
    }

    const expense_type = mapReceiptTypeToReportCategory(r.receiptType?.receiptTypeName);
    const status = mapValidationToReportStatus(r.validation, req.requestStatusId);

    if (filterExpenseTypes.size > 0 && !filterExpenseTypes.has(expense_type)) continue;
    if (filterStatuses.size > 0 && !filterStatuses.has(status)) continue;
    if (filterCcIds.length > 0 && !filterCcIds.includes(cost_center_id)) continue;

    const sub = r.submissionDate ?? r.validationDate ?? req.creationDate;
    if (!sub || Number.isNaN(sub.getTime())) continue;

    rows.push({
      cost_center_id,
      cost_center_code,
      cost_center_name,
      period: periodKeyForDate(sub, period),
      amount: Number(r.amount) || 0,
      expense_type,
      status,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    scope,
    team_member_count: scope === "team" ? teamUserIds?.length ?? 0 : null,
    rows,
    budgets,
  };
}
