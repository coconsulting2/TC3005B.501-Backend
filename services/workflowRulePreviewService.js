/**
 * @module workflowRulePreviewService
 * @description Simula el resultado del motor de reglas (solo lectura) para la UI de admin.
 */
import prisma from "../database/config/prisma.js";
import {
  buildSnapshot,
  initialStatusFromLevels,
  ruleMatches,
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
  if (editingRuleId !== undefined && editingRuleId !== null && String(editingRuleId).trim() !== "") {
    let editId;
    try {
      editId = BigInt(String(editingRuleId).trim());
    } catch {
      const err = new Error("editingRuleId debe ser un entero válido.");
      err.status = 400;
      throw err;
    }
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
 * @param {object} ctx
 * @param {number} amount
 * @param {{ threshold: number, approvalLevel: number } | null} matchedBand
 * @param {ReturnType<typeof toEngineRule>[]} scopedRules
 * @param {object | null} [draftRule]
 * @returns {{ summary: string, hints: string[] }}
 */
function buildSpanishSummary(snap, ctx, amount, matchedBand, scopedRules, draftRule = null) {
  const hints = [];
  const amt = formatMxn(amount);
  const levelsText = levelsToHuman(snap.levels);
  const statusLabel = STATUS_LABELS[initialStatusFromLevels(snap.levels)] ?? "Revisión";
  const focusType = draftRule?.paramType ?? "importe";

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

  if (draftRule?.paramValue != null && String(draftRule.paramValue).trim() !== "") {
    const pv = String(draftRule.paramValue).trim();
    switch (focusType) {
      case "destino": {
        const want = Number(pv);
        const match = (ctx.destinationCountryIds || []).some((id) => Number(id) === want);
        hints.unshift(
          match
            ? `Regla por destino: aplica con el país simulado (ID ${want}) → nivel mínimo N${draftRule.approvalLevel}.`
            : `Regla por destino: no aplica con el país simulado (requiere ID ${want}).`,
        );
        break;
      }
      case "moneda": {
        const cur = (ctx.currency || "MXN").trim().toUpperCase();
        const match = pv.toUpperCase() === cur;
        hints.unshift(
          match
            ? `Regla por moneda: aplica con ${cur} → nivel mínimo N${draftRule.approvalLevel}.`
            : `Regla por moneda: no aplica (requiere ${pv.toUpperCase()}, simulaste ${cur}).`,
        );
        break;
      }
      case "nivel": {
        const match =
          ctx.orgLevel !== null &&
          ctx.orgLevel !== undefined &&
          String(ctx.orgLevel) === pv;
        hints.unshift(
          match
            ? `Regla por nivel org.: aplica con nivel ${pv} → N${draftRule.approvalLevel}.`
            : `Regla por nivel org.: no aplica (requiere nivel ${pv}, simulaste ${ctx.orgLevel ?? "—"}).`,
        );
        break;
      }
      case "gasto": {
        const want = Number(pv);
        const match = (ctx.receiptTypeIds || []).some((id) => Number(id) === want);
        hints.unshift(
          match
            ? `Regla por tipo de gasto: aplica con comprobante ID ${want} → N${draftRule.approvalLevel}.`
            : `Regla por tipo de gasto: no aplica (requiere ID ${want}).`,
        );
        break;
      }
      default:
        break;
    }
  }

  let summary;
  if (focusType === "destino") {
    const dest = ctx.destinationCountryIds?.[0];
    summary = dest
      ? `Destino simulado (país ID ${dest})${snap.levels.length ? `: ruta ${levelsText}, inicio ${statusLabel}.` : ": no se determinaron niveles con las reglas activas."}`
      : `Selecciona un país de destino para simular esta regla.${snap.levels.length ? ` Con monto ${amt}: ${levelsText}.` : ""}`;
  } else if (focusType === "moneda") {
    summary = `Moneda ${ctx.currency}${snap.levels.length ? `: ruta ${levelsText}, inicio ${statusLabel} (monto base ${amt}).` : `: sin niveles definidos (monto base ${amt}).`}`;
  } else if (focusType === "nivel") {
    summary = `Nivel org. ${ctx.orgLevel ?? "—"}${snap.levels.length ? `: ruta ${levelsText}, inicio ${statusLabel} (monto base ${amt}).` : `: sin niveles definidos (monto base ${amt}).`}`;
  } else if (focusType === "gasto") {
    const rt = ctx.receiptTypeIds?.[0];
    summary = rt
      ? `Tipo de gasto simulado (ID ${rt})${snap.levels.length ? `: ruta ${levelsText}, inicio ${statusLabel}.` : ": no se determinaron niveles."}`
      : `Selecciona un tipo de comprobante para simular.${snap.levels.length ? ` Monto base ${amt}: ${levelsText}.` : ""}`;
  } else if (snap.skipApplied && snap.levels.length === 1 && snap.levels[0] > 1) {
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
 * Describe la condición configurada en lenguaje natural (preview aislado).
 * @param {string} paramType
 * @param {string | null | undefined} paramValue
 * @param {object} ctx
 * @returns {Promise<string>}
 */
async function describeDraftCondition(paramType, paramValue, ctx) {
  const pv = String(paramValue ?? "").trim();
  switch (paramType) {
    case "destino": {
      const id = Number(pv);
      if (!Number.isFinite(id)) return "un país de destino concreto";
      const row = await prisma.country.findUnique({
        where: { countryId: id },
        select: { countryName: true },
      });
      return row?.countryName ? `destino ${row.countryName}` : `destino (país ID ${id})`;
    }
    case "moneda":
      return pv ? `moneda ${pv.toUpperCase()}` : "una moneda concreta";
    case "nivel":
      return pv ? `nivel org. ${pv}` : "un nivel org. concreto";
    case "gasto": {
      const id = Number(pv);
      return Number.isFinite(id) ? `tipo de gasto ID ${id}` : "un tipo de gasto concreto";
    }
    default:
      return "la condición configurada";
  }
}

/**
 * Simula solo el borrador actual (paramType ≠ importe), sin mezclar otras reglas de la org.
 * @param {ReturnType<typeof draftToEngineRule>} draftEngine
 * @param {object} draftInput
 * @param {object} ctx
 * @param {"pre"|"post"} ruleType
 * @param {number} amount
 * @returns {Promise<object>}
 */
async function previewIsolatedDraftRule(draftEngine, draftInput, ctx, ruleType, amount) {
  const paramValue = draftInput.paramValue;
  const hasValue = paramValue != null && String(paramValue).trim() !== "";

  if (!hasValue) {
    return {
      levels: [1],
      minApprovalLevel: 1,
      maxApprovalLevel: 1,
      skipApplied: false,
      initialStatusId: 2,
      initialStatusLabel: STATUS_LABELS[2],
      summary: "Completa el valor de la condición arriba para simular el efecto de esta regla.",
      hints: [],
      matchedImportBand: null,
      targetRole: draftEngine.targetRole ?? null,
      amountEvaluated: amount,
      currencyEvaluated: ctx.currency,
      draftRuleApplies: false,
    };
  }

  const matches = ruleMatches(draftEngine, ctx);
  let levels = [1];
  let maxApprovalLevel = 1;

  if (matches) {
    let maxLevel = draftEngine.approvalLevel;
    if (draftEngine.managerSteps && draftEngine.managerSteps > 0) {
      maxLevel = Math.max(maxLevel, draftEngine.managerSteps);
    } else {
      maxLevel = Math.min(2, Math.max(1, maxLevel));
    }
    levels = [];
    for (let L = 1; L <= maxLevel; L++) levels.push(L);
    maxApprovalLevel = maxLevel;
  }

  const initialStatusId = initialStatusFromLevels(levels);
  const levelsText = levelsToHuman(levels);
  const statusLabel = STATUS_LABELS[initialStatusId] ?? "Revisión";
  const hints = [];

  if (matches) {
    hints.push(
      `Condición cumplida → se exige al menos nivel N${draftEngine.approvalLevel}.`,
    );
    if (draftEngine.managerSteps) {
      hints.push(`Pasos de jefe configurados: ${draftEngine.managerSteps}.`);
    }
    if (draftEngine.targetRole) {
      hints.push(`Rol destino: ${draftEngine.targetRole}.`);
    }
  } else {
    const required = await describeDraftCondition(draftInput.paramType, paramValue, ctx);
    hints.push(`Esta regla exige ${required}.`);
    hints.push("Ajusta el valor del formulario o la simulación para ver el efecto al activarse.");
  }

  let summary;
  if (!matches) {
    summary = "La condición de esta regla no se cumple con el escenario simulado.";
  } else if (levels.length > 1) {
    summary = `Al activarse, la solicitud recorre ${levelsText} e inicia en ${statusLabel}.`;
  } else if (levels.length === 1) {
    summary = `Al activarse, la solicitud pasa por ${levelsText} e inicia en ${statusLabel}.`;
  } else {
    summary = "No se determinó ruta de aprobación para esta regla.";
  }

  return {
    levels,
    minApprovalLevel: 1,
    maxApprovalLevel,
    skipApplied: false,
    initialStatusId,
    initialStatusLabel: statusLabel,
    summary,
    hints,
    matchedImportBand: null,
    targetRole: draftEngine.targetRole ?? null,
    amountEvaluated: amount,
    currencyEvaluated: ctx.currency,
    draftRuleApplies: matches,
  };
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
    currency:
      typeof input.currency === "string" && input.currency.trim()
        ? input.currency.trim().toUpperCase()
        : "MXN",
    destinationCountryIds: input.destinationCountryIds ?? [],
    receiptTypeIds: input.receiptTypeIds ?? [],
    orgLevel: input.orgLevel ?? null,
    departmentId,
  };

  const draftInput = input.draftRule ?? null;
  if (draftInput?.paramType && draftInput.paramType !== "importe") {
    const draftEngine = draftToEngineRule(draftInput, organizationId);
    return previewIsolatedDraftRule(draftEngine, draftInput, ctx, ruleType, amount);
  }

  const scoped = merged.filter(
    (r) =>
      r.ruleType === ruleType &&
      r.active &&
      (!r.departmentId || r.departmentId === departmentId),
  );

  const importeRules = scoped.filter((r) => r.paramType === "importe");
  const bandRule = importeRules
    .filter((r) => r.threshold !== null && amount <= Number(r.threshold))
    .sort((a, b) => Number(a.threshold) - Number(b.threshold))[0];

  const matchedImportBand = bandRule
    ? { threshold: Number(bandRule.threshold), approvalLevel: bandRule.approvalLevel }
    : null;

  const snap = buildSnapshot(merged, ctx, ruleType, {
    n1UserId: null,
    n2UserId: null,
    approverIds: [],
  });

  const initialStatusId = initialStatusFromLevels(snap.levels);
  const { summary, hints } = buildSpanishSummary(
    snap,
    ctx,
    amount,
    matchedImportBand,
    scoped,
    draftRule,
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
    matchedImportBand,
    targetRole: snap.targetRole,
    amountEvaluated: amount,
    currencyEvaluated: ctx.currency,
  };
}
