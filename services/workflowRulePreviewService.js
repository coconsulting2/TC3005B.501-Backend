/**
 * @module workflowRulePreviewService
 * @description Simula el resultado del motor de reglas (solo lectura) para la UI de admin.
 */
import prisma from "../database/config/prisma.js";
import {
  buildSnapshot,
  initialStatusFromLevels,
  maxLevelFromImporteBands,
} from "./workflowRulesEngine.js";

const STATUS_LABELS = {
  2: "Primera Revisión (N1)",
  3: "Segunda Revisión (N2)",
};

const LEVEL_LABELS = {
  1: "N1",
  2: "N2",
  3: "N3",
};

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

/**
 * @param {number} n
 * @returns {string}
 */
function formatMxn(n) {
  return MXN.format(n);
}

/**
 * @param {import("@prisma/client").WorkflowRule} row
 * @returns {import("./workflowRulesEngine.js").WorkflowRuleRow & { departmentId?: number | null, managerSteps?: number | null, targetRole?: string | null }}
 */
function toEngineRule(row) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ruleType: row.ruleType,
    paramType: row.paramType,
    threshold: row.threshold !== null ? Number(row.threshold) : null,
    paramValue: row.paramValue,
    approvalLevel: row.approvalLevel,
    skipIfBelow: row.skipIfBelow !== null ? Number(row.skipIfBelow) : null,
    priority: row.priority,
    active: row.active,
    departmentId: row.departmentId,
    managerSteps: row.managerSteps,
    targetRole: row.targetRole,
  };
}

/**
 * @param {object} draft
 * @param {bigint} organizationId
 * @returns {ReturnType<typeof toEngineRule>}
 */
function draftToEngineRule(draft, organizationId) {
  return {
    id: BigInt(0),
    organizationId,
    ruleType: draft.ruleType ?? "pre",
    paramType: draft.paramType ?? "importe",
    threshold: draft.threshold != null ? Number(draft.threshold) : null,
    paramValue: draft.paramValue ?? null,
    approvalLevel: Number(draft.approvalLevel) || 1,
    skipIfBelow: draft.skipIfBelow != null ? Number(draft.skipIfBelow) : null,
    priority: Number(draft.priority) || 10,
    active: true,
    departmentId: draft.departmentId != null ? Number(draft.departmentId) : null,
    managerSteps: draft.managerSteps != null ? Number(draft.managerSteps) : null,
    targetRole: draft.targetRole ?? null,
  };
}

/**
 * @param {ReturnType<typeof toEngineRule>[]} rules
 * @param {ReturnType<typeof draftToEngineRule> | null} draftRule
 * @param {string | undefined} editingRuleId
 * @returns {ReturnType<typeof toEngineRule>[]}
 */
function mergeDraftRule(rules, draftRule, editingRuleId) {
  if (!draftRule) return rules;
  const activeRules = rules.filter((r) => r.active);
  if (editingRuleId) {
    const editId = BigInt(editingRuleId);
    const idx = activeRules.findIndex((r) => r.id === editId);
    if (idx >= 0) {
      const next = [...activeRules];
      next[idx] = { ...draftRule, id: editId, active: true };
      return next;
    }
  }
  return [...activeRules, draftRule];
}

/**
 * @param {number[]} levels
 * @returns {string}
 */
function levelsToHuman(levels) {
  if (!levels.length) return "ningún nivel";
  return levels.map((l) => LEVEL_LABELS[l] ?? `Nivel ${l}`).join(" → ");
}

/**
 * @param {ReturnType<typeof buildSnapshot>} snap
 * @param {number} amount
 * @param {{ threshold: number, approvalLevel: number } | null} matchedBand
 * @param {ReturnType<typeof toEngineRule>[]} scopedRules
 * @returns {{ summary: string, hints: string[] }}
 */
function buildSpanishSummary(snap, amount, matchedBand, scopedRules) {
  const hints = [];
  const amt = formatMxn(amount);
  const levelsText = levelsToHuman(snap.levels);
  const statusLabel = STATUS_LABELS[initialStatusFromLevels(snap.levels)] ?? "Revisión";

  if (matchedBand) {
    hints.push(
      `Banda de importe: umbral ${formatMxn(matchedBand.threshold)} → nivel máximo ${matchedBand.approvalLevel}.`,
    );
  }

  const skipRules = scopedRules.filter(
    (r) => r.skipIfBelow != null && amount < Number(r.skipIfBelow),
  );
  for (const r of skipRules) {
    hints.push(
      `Skip activo: montos menores a ${formatMxn(Number(r.skipIfBelow))} empiezan en N${r.approvalLevel} (sin pasar por niveles inferiores).`,
    );
  }

  const managerRules = scopedRules.filter((r) => r.managerSteps && r.managerSteps > 0);
  if (managerRules.length > 0) {
    const maxSteps = Math.max(...managerRules.map((r) => r.managerSteps));
    hints.push(`Pasos de jefe: se requieren hasta ${maxSteps} nivel(es) en la cadena.`);
  }

  if (snap.targetRole) {
    hints.push(`Rol destino configurado: ${snap.targetRole} (referencia; no altera los niveles numéricos).`);
  }

  let summary;
  if (snap.skipApplied && snap.levels.length === 1 && snap.levels[0] > 1) {
    summary = `Para ${amt}, la solicitud inicia en ${statusLabel} porque un skip elevó el piso del flujo. Ruta: ${levelsText}.`;
  } else if (snap.levels.length === 1) {
    summary = `Para ${amt}, la solicitud pasa solo por ${levelsText} e inicia en ${statusLabel}.`;
  } else if (snap.levels.length > 1) {
    summary = `Para ${amt}, la solicitud recorre ${levelsText} e inicia en ${statusLabel}.`;
  } else {
    summary = `Para ${amt}, no se determinaron niveles de aprobación con las reglas activas.`;
  }

  return { summary, hints };
}

/**
 * @param {bigint} organizationId
 * @param {object} input
 * @param {number} input.amount
 * @param {"pre"|"post"} [input.ruleType]
 * @param {number | null} [input.departmentId]
 * @param {string} [input.currency]
 * @param {number[]} [input.destinationCountryIds]
 * @param {number[]} [input.receiptTypeIds]
 * @param {number | null} [input.orgLevel]
 * @param {object} [input.draftRule]
 * @param {string} [input.editingRuleId]
 */
export async function previewWorkflowRules(organizationId, input) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    const err = new Error("El monto debe ser un número mayor o igual a cero.");
    err.status = 400;
    throw err;
  }

  const ruleType = input.ruleType === "post" ? "post" : "pre";
  const departmentId =
    input.departmentId !== undefined && input.departmentId !== null
      ? Number(input.departmentId)
      : null;

  const rows = await prisma.workflowRule.findMany({
    where: { organizationId, active: true },
  });

  const engineRules = rows.map(toEngineRule);
  const draftRule = input.draftRule
    ? draftToEngineRule(input.draftRule, organizationId)
    : null;
  const merged = mergeDraftRule(engineRules, draftRule, input.editingRuleId);

  const ctx = {
    amount,
    currency: (input.currency || "MXN").trim().toUpperCase(),
    destinationCountryIds: input.destinationCountryIds ?? [],
    receiptTypeIds: input.receiptTypeIds ?? [],
    orgLevel: input.orgLevel ?? null,
    departmentId,
  };

  const scoped = merged.filter(
    (r) =>
      r.ruleType === ruleType &&
      r.active &&
      (!r.departmentId || r.departmentId === departmentId),
  );

  const importeRules = scoped.filter((r) => r.paramType === "importe");
  const bandLevel = maxLevelFromImporteBands(amount, importeRules);
  const bandRule = importeRules
    .filter((r) => r.threshold !== null && amount <= Number(r.threshold))
    .sort((a, b) => Number(a.threshold) - Number(b.threshold))[0];

  const matchedImportBand = bandRule
    ? { threshold: Number(bandRule.threshold), approvalLevel: bandRule.approvalLevel }
    : bandLevel
      ? { threshold: null, approvalLevel: bandLevel }
      : null;

  const snap = buildSnapshot(merged, ctx, ruleType, {
    n1UserId: null,
    n2UserId: null,
    approverIds: [],
  });

  const initialStatusId = initialStatusFromLevels(snap.levels);
  const { summary, hints } = buildSpanishSummary(
    snap,
    amount,
    bandRule
      ? { threshold: Number(bandRule.threshold), approvalLevel: bandRule.approvalLevel }
      : null,
    scoped,
  );

  return {
    levels: snap.levels,
    minApprovalLevel: snap.minApprovalLevel,
    maxApprovalLevel: snap.maxApprovalLevel,
    skipApplied: snap.skipApplied,
    initialStatusId,
    initialStatusLabel: STATUS_LABELS[initialStatusId] ?? "Revisión",
    summary,
    hints,
    matchedImportBand: bandRule
      ? { threshold: Number(bandRule.threshold), approvalLevel: bandRule.approvalLevel }
      : null,
    targetRole: snap.targetRole,
    amountEvaluated: amount,
    currencyEvaluated: ctx.currency,
  };
}
