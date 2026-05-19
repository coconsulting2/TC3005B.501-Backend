/**
 * @module solicitudJourneyService
 * @description Construye el recorrido completo de una solicitud (pasos completados,
 *              actual y pendientes) para la línea de tiempo / stepper horizontal.
 */

/** @typedef {'completed'|'current'|'pending'|'skipped'|'failed'|'cancelled'} StepState */

/**
 * @typedef {Object} JourneyStepDef
 * @property {string} key
 * @property {number} statusId
 * @property {string} label
 */

/**
 * @typedef {Object} JourneyStep
 * @property {string} key
 * @property {number} statusId
 * @property {string} label
 * @property {StepState} state
 * @property {string|null} [timestamp]
 * @property {string|null} [actor]
 * @property {string|null} [note]
 */

/**
 * @param {unknown} snapshot
 * @returns {number[]}
 */
export function approvalLevelsFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return [1, 2];
  const levels = /** @type {{ levels?: unknown }} */ (snapshot).levels;
  if (!Array.isArray(levels) || levels.length === 0) return [1, 2];
  const parsed = [...new Set(levels.map(Number).filter((n) => n === 1 || n === 2))];
  return parsed.length ? parsed.sort((a, b) => a - b) : [1, 2];
}

/**
 * @param {Array<{ route?: { hotelNeeded?: boolean, planeNeeded?: boolean } }>} routeRequests
 * @returns {boolean}
 */
export function routeNeedsAgency(routeRequests) {
  if (!Array.isArray(routeRequests)) return false;
  return routeRequests.some((rr) => {
    const route = rr?.route ?? rr;
    return Boolean(route?.hotelNeeded) || Boolean(route?.planeNeeded);
  });
}

/**
 * @param {{ workflowPreSnapshot?: unknown, routeRequests?: unknown[], includeDraft?: boolean }} input
 * @returns {JourneyStepDef[]}
 */
export function buildJourneyStepDefinitions(input) {
  const levels = approvalLevelsFromSnapshot(input.workflowPreSnapshot);
  const includeDraft = input.includeDraft !== false;
  /** @type {JourneyStepDef[]} */
  const steps = [];

  if (includeDraft) {
    steps.push({ key: "draft", statusId: 1, label: "Borrador" });
  }
  if (levels.includes(1)) {
    steps.push({ key: "n1", statusId: 2, label: "Primera revisión" });
  }
  if (levels.includes(2)) {
    steps.push({ key: "n2", statusId: 3, label: "Segunda revisión" });
  }
  steps.push({ key: "quote", statusId: 4, label: "Cotización del viaje" });
  if (routeNeedsAgency(input.routeRequests ?? [])) {
    steps.push({ key: "agency", statusId: 5, label: "Atención agencia de viajes" });
  }
  steps.push(
    { key: "expenses", statusId: 6, label: "Comprobación de gastos" },
    { key: "validation", statusId: 7, label: "Validación de comprobantes" },
    { key: "done", statusId: 8, label: "Finalizado" },
  );

  return steps;
}

/**
 * @param {JourneyStepDef[]} stepDefs
 * @param {Array<{ accion: string }>} historial
 * @returns {string|null}
 */
function inferFailedStepKey(stepDefs, historial) {
  const approvalSteps = stepDefs.filter((s) => s.key === "n1" || s.key === "n2");
  if (!approvalSteps.length) return "quote";

  const approvals = historial.filter((h) => h.accion === "APROBADO").length;
  if (approvals >= approvalSteps.length) {
    return approvalSteps[approvalSteps.length - 1].key;
  }
  return approvalSteps[approvals]?.key ?? approvalSteps[0].key;
}

/**
 * @param {JourneyStepDef[]} stepDefs
 * @param {number} currentStatusId
 * @param {Array<{ accion: string }>} historial
 * @returns {Map<string, StepState>}
 */
function resolveStepStates(stepDefs, currentStatusId, historial) {
  /** @type {Map<string, StepState>} */
  const states = new Map();

  if (currentStatusId === 9) {
    for (const step of stepDefs) {
      states.set(step.key, step.statusId === 9 ? "failed" : "cancelled");
    }
    states.set("draft", "completed");
    return states;
  }

  if (currentStatusId === 10) {
    const failedKey = inferFailedStepKey(stepDefs, historial);
    let pastFailed = true;
    for (const step of stepDefs) {
      if (step.key === failedKey) {
        states.set(step.key, "failed");
        pastFailed = false;
      } else if (pastFailed) {
        states.set(step.key, "completed");
      } else {
        states.set(step.key, "cancelled");
      }
    }
    return states;
  }

  for (const step of stepDefs) {
    if (currentStatusId > step.statusId) {
      states.set(step.key, "completed");
    } else if (currentStatusId === step.statusId) {
      states.set(step.key, "current");
    } else {
      states.set(step.key, "pending");
    }
  }

  return states;
}

/**
 * @param {JourneyStepDef[]} stepDefs
 * @param {Array<{ accion: string, createdAt: Date, user?: { userName?: string }, comentario?: string|null }>} historial
 * @param {Date} creationDate
 * @returns {Map<string, { timestamp: string|null, actor: string|null, note: string|null }>}
 */
function annotateStepsFromHistorial(stepDefs, historial, creationDate) {
  /** @type {Map<string, { timestamp: string|null, actor: string|null, note: string|null }>} */
  const meta = new Map();

  meta.set("draft", {
    timestamp: creationDate.toISOString(),
    actor: null,
    note: null,
  });

  const approvalKeys = stepDefs
    .filter((s) => s.key === "n1" || s.key === "n2")
    .map((s) => s.key);
  const approvals = historial.filter((h) => h.accion === "APROBADO");
  approvalKeys.forEach((key, idx) => {
    const row = approvals[idx];
    if (!row) return;
    meta.set(key, {
      timestamp: row.createdAt.toISOString(),
      actor: row.user?.userName ?? null,
      note: row.comentario ?? null,
    });
  });

  const reject = historial.find((h) => h.accion === "RECHAZADO");
  if (reject) {
    const failedKey = inferFailedStepKey(stepDefs, historial);
    meta.set(failedKey, {
      timestamp: reject.createdAt.toISOString(),
      actor: reject.user?.userName ?? null,
      note: reject.comentario ?? null,
    });
  }

  for (const row of historial) {
    if (row.accion === "ESCALADO" || row.accion === "REASIGNADO") {
      const note = row.comentario
        ? `${row.accion}: ${row.comentario}`
        : row.accion;
      const targetKey = approvalKeys.find((k) => !meta.get(k)?.actor) ?? approvalKeys[0];
      if (targetKey) {
        const prev = meta.get(targetKey) ?? { timestamp: null, actor: null, note: null };
        meta.set(targetKey, {
          ...prev,
          note: prev.note ? `${prev.note} · ${note}` : note,
        });
      }
    }
  }

  return meta;
}

/**
 * @param {object} input
 * @param {number} input.currentStatusId
 * @param {string} [input.currentStatusLabel]
 * @param {unknown} [input.workflowPreSnapshot]
 * @param {unknown[]} [input.routeRequests]
 * @param {Date} input.creationDate
 * @param {Array<{ accion: string, createdAt: Date, comentario?: string|null, user?: { userName?: string, role?: { roleName?: string } } }>} [input.historial]
 * @returns {{ currentStatusId: number, currentStatusLabel: string, steps: JourneyStep[], events: object[] }}
 */
export function buildSolicitudJourney(input) {
  const currentStatusId = Number(input.currentStatusId);
  const historial = input.historial ?? [];
  const stepDefs = buildJourneyStepDefinitions({
    workflowPreSnapshot: input.workflowPreSnapshot,
    routeRequests: input.routeRequests,
    includeDraft: true,
  });

  const stateMap = resolveStepStates(stepDefs, currentStatusId, historial);
  const metaMap = annotateStepsFromHistorial(
    stepDefs,
    historial,
    input.creationDate,
  );

  /** @type {JourneyStep[]} */
  const steps = stepDefs.map((def) => {
    const meta = metaMap.get(def.key);
    return {
      key: def.key,
      statusId: def.statusId,
      label: def.label,
      state: stateMap.get(def.key) ?? "pending",
      timestamp: meta?.timestamp ?? null,
      actor: meta?.actor ?? null,
      note: meta?.note ?? null,
    };
  });

  if (currentStatusId === 9) {
    steps.push({
      key: "cancelled",
      statusId: 9,
      label: "Cancelado",
      state: "failed",
      timestamp: null,
      actor: null,
      note: null,
    });
  } else if (currentStatusId === 10) {
    steps.push({
      key: "rejected",
      statusId: 10,
      label: "Rechazado",
      state: "failed",
      timestamp:
        historial.find((h) => h.accion === "RECHAZADO")?.createdAt.toISOString() ??
        null,
      actor:
        historial.find((h) => h.accion === "RECHAZADO")?.user?.userName ?? null,
      note:
        historial.find((h) => h.accion === "RECHAZADO")?.comentario ?? null,
    });
  }

  const events = historial.map((h) => ({
    action: h.accion,
    user: h.user?.userName ?? "Usuario",
    role: h.user?.role?.roleName ?? "",
    timestamp: h.createdAt.toISOString(),
    comment: h.comentario || null,
  }));

  return {
    currentStatusId,
    currentStatusLabel: input.currentStatusLabel ?? "",
    steps,
    events,
  };
}
