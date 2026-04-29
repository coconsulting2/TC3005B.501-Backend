/**
 * @module approvalSubstituteService
 * @description Business rules for substitute approvers and automatic escalation.
 */
import { loadEffectivePermissions } from "./permissionService.js";
import ApprovalSubstituteModel from "../models/approvalSubstituteModel.js";

/**
 * @param {string|Date} value
 * @param {string} fieldName
 * @returns {Date}
 */
function parseDate(value, fieldName) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw { status: 400, message: `${fieldName} inválido` };
  }
  return d;
}

/**
 * @param {number} userId
 * @returns {Promise<void>}
 */
async function ensureAuthorizerUser(userId) {
  const roleName = await ApprovalSubstituteModel.getUserRoleName(userId);
  if (!roleName) {
    throw { status: 404, message: "Usuario no encontrado" };
  }
  if (roleName === "Observador") {
    throw {
      status: 400,
      message: "No se puede asignar un usuario de solo notificación como sustituto",
    };
  }
  const permissions = await loadEffectivePermissions(Number(userId));
  if (!permissions.includes("travel_request:authorize")) {
    throw {
      status: 400,
      message: "El usuario sustituto no cuenta con permiso para autorizar",
    };
  }
}

/**
 * @param {number} approverId
 * @returns {Promise<Array<object>>}
 */
export async function listSubstitutes(approverId) {
  return ApprovalSubstituteModel.listByApprover(approverId);
}

/**
 * @param {number} approverId
 * @param {number} substituteId
 * @param {string|Date} validFrom
 * @param {string|Date} validTo
 * @returns {Promise<object|null>}
 */
export async function createSubstitute(approverId, substituteId, validFrom, validTo) {
  const aid = Number(approverId);
  const sid = Number(substituteId);
  if (!Number.isFinite(sid) || sid < 1) {
    throw { status: 400, message: "substitute_id inválido" };
  }
  if (aid === sid) {
    throw { status: 400, message: "El sustituto no puede ser el mismo aprobador" };
  }

  const from = parseDate(validFrom, "valid_from");
  const to = parseDate(validTo, "valid_to");
  if (to <= from) {
    throw { status: 400, message: "valid_to debe ser mayor que valid_from" };
  }

  await ensureAuthorizerUser(aid);
  await ensureAuthorizerUser(sid);

  return ApprovalSubstituteModel.createSubstitute({
    approverId: aid,
    substituteId: sid,
    validFrom: from,
    validTo: to,
  });
}

/**
 * @param {number} id
 * @param {number} approverId
 * @returns {Promise<{message: string}>}
 */
export async function deleteSubstitute(id, approverId) {
  const deleted = await ApprovalSubstituteModel.deleteSubstitute(id, approverId);
  if (!deleted) {
    throw { status: 404, message: "Sustituto no encontrado" };
  }
  return { message: "Sustituto eliminado correctamente" };
}

/**
 * @param {number} requestStatusId
 * @param {object|null} workflowPreSnapshot
 * @returns {{tier: number|null, approverId: number|null, snapshot: object}}
 */
function resolveAssignedApprover(requestStatusId, workflowPreSnapshot) {
  const snap =
    workflowPreSnapshot && typeof workflowPreSnapshot === "object"
      ? workflowPreSnapshot
      : {};
  if (requestStatusId === 2) {
    return { tier: 1, approverId: Number(snap.n1UserId), snapshot: { ...snap } };
  }
  if (requestStatusId === 3) {
    return { tier: 2, approverId: Number(snap.n2UserId), snapshot: { ...snap } };
  }
  return { tier: null, approverId: null, snapshot: { ...snap } };
}

/**
 * @param {Date} [nowDate]
 * @returns {Promise<{reassigned: number, escalated: number, skipped: number}>}
 */
export async function processStaleApprovals(nowDate = new Date()) {
  const stale = await ApprovalSubstituteModel.listStalePendingRequests(nowDate);
  const results = { reassigned: 0, escalated: 0, skipped: 0 };

  for (const row of stale) {
    const { requestId, requestStatusId, workflowPreSnapshot } = row;
    const { tier, approverId, snapshot } = resolveAssignedApprover(
      Number(requestStatusId),
      workflowPreSnapshot,
    );

    if (!tier || !Number.isFinite(approverId) || approverId < 1) {
      results.skipped += 1;
      continue;
    }

    const sub = await ApprovalSubstituteModel.getActiveSubstitute(approverId, nowDate);
    if (sub) {
      try {
        await ensureAuthorizerUser(sub.substituteId);
      } catch {
        results.skipped += 1;
        continue;
      }

      if (tier === 1) snapshot.n1UserId = Number(sub.substituteId);
      if (tier === 2) snapshot.n2UserId = Number(sub.substituteId);

      await ApprovalSubstituteModel.applyWorkflowAction(
        requestId,
        { statusId: Number(requestStatusId), workflowPreSnapshot: snapshot },
        Number(sub.substituteId),
        "REASIGNADO",
        `Reasignación automática por inactividad >48h. Aprobador original: ${approverId}, sustituto: ${sub.substituteId}.`,
      );
      await ApprovalSubstituteModel.createAlert(requestId, requestStatusId === 2 ? 2 : 3);
      results.reassigned += 1;
      continue;
    }

    if (Number(requestStatusId) === 2) {
      await ApprovalSubstituteModel.applyWorkflowAction(
        requestId,
        { statusId: 3 },
        approverId,
        "ESCALADO",
        "Escalamiento automático por inactividad del aprobador >48h.",
      );
      await ApprovalSubstituteModel.createAlert(requestId, 3);
      results.escalated += 1;
      continue;
    }

    results.skipped += 1;
  }

  return results;
}

export default {
  listSubstitutes,
  createSubstitute,
  deleteSubstitute,
  processStaleApprovals,
};
