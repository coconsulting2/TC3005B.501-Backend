/**
 * @module authorizerService
 * @description Handles authorization workflows for travel requests,
 * including approval and rejection by N1/N2 roles (M2-004 + M2-005 montos/historial).
 */
import Authorizer, { SolicitudHistorialAccion } from "../models/authorizerModel.js";
import {
  statusAfterN1Approval,
  statusAfterN2Approval,
} from "./workflowRulesEngine.js";
import * as policyExceptionService from "./policyExceptionService.js";
import anticipoPolizaLifecycleService from "./anticipoPolizaLifecycleService.js";
import employeeHierarchyService from "./employeeHierarchyService.js";

/**
 * @param {object | null} snapshot
 * @param {number} tier 1=N1, 2=N2
 * @param {number} authorId
 * @param {string | null} roleName
 * @returns {boolean}
 */
function authorizerMatchesTier(snapshot, tier, authorId, roleName) {
  const key = tier === 1 ? "n1UserId" : "n2UserId";
  const designated =
    snapshot && typeof snapshot === "object" ? snapshot[key] : null;
  if (designated != null) {
    return Number(designated) === Number(authorId);
  }
  if (tier === 1) return roleName === "N1";
  if (tier === 2) return roleName === "N2";
  return false;
}

function requestAmount(ctx) {
  const f = ctx.requestedFee;
  return f == null ? 0 : Number(f);
}

/**
 * @param {number} amount
 * @param {number|null} maxAmount null = sin tope
 * @returns {boolean}
 */
function amountExceedsLimit(amount, maxAmount) {
  if (maxAmount == null) return false;
  return Number(amount) > Number(maxAmount);
}

function labelForStatusId(statusId) {
  if (statusId === 3) return "Segunda Revisión";
  if (statusId === 4) return "Cotización del Viaje";
  if (statusId === 10) return "Rechazado";
  return "Actualizado";
}

function useHierarchyApprovalMode() {
  return String(process.env.WORKFLOW_APPROVAL_MODE || "").toLowerCase() === "hierarchy";
}

/**
 * En modo jerárquico, obtiene el aprobador esperado para el estado actual:
 * - status 2 (N1 lógico): jefe directo
 * - status 3 (N2 lógico): jefe del jefe
 * @param {object} ctx
 * @returns {Promise<number|null>}
 */
async function expectedApproverByHierarchy(ctx) {
  if (!ctx?.userId) return null;
  const chain = await employeeHierarchyService.getApprovalChain(Number(ctx.userId), 4);
  if (ctx.requestStatusId === 2) return chain[0] ?? null;
  if (ctx.requestStatusId === 3) return chain[1] ?? null;
  return null;
}

/**
 * Coexistencia: intenta validar por jerarquía si está activo; si no, usa snapshot N1/N2.
 * @param {object} ctx
 * @param {number} tier
 * @param {number} userId
 * @param {string|null} roleName
 * @returns {Promise<boolean>}
 */
async function canActOnTier(ctx, tier, userId, roleName) {
  if (useHierarchyApprovalMode()) {
    const expected = await expectedApproverByHierarchy(ctx);
    if (expected != null) return Number(expected) === Number(userId);
  }
  return authorizerMatchesTier(ctx?.workflowPreSnapshot, tier, userId, roleName);
}

/**
 * Póliza AV al aprobar la solicitud (requested_fee). No bloquea el flujo si falla persistencia.
 * @param {number} requestId
 * @param {number} newStatusId
 */
async function emitAnticipoPolizaIfApproved(requestId, newStatusId) {
  if (Number(newStatusId) !== 4) return;
  try {
    await anticipoPolizaLifecycleService.onTravelRequestFullyApproved(requestId);
  } catch (err) {
    console.error(
      "emitAnticipoPolizaIfApproved:",
      err?.message || err,
    );
  }
}

/**
 * Valida que el usuario puede actuar en el tier actual (rechazo).
 * @param {object} ctx
 * @param {number} user_id
 * @param {string|null} roleName
 */
function ensureTierForDecline(ctx, user_id, roleName) {
  const snap = ctx.workflowPreSnapshot;
  const levels =
    snap && typeof snap === "object" && Array.isArray(snap.levels)
      ? snap.levels
      : [1, 2];

  if (ctx.requestStatusId === 2) {
    if (
      !authorizerMatchesTier(snap, 1, user_id, roleName) ||
      !levels.includes(1)
    ) {
      throw {
        status: 400,
        message:
          "User role not authorized to decline request at this stage",
      };
    }
  } else if (ctx.requestStatusId === 3) {
    if (
      !authorizerMatchesTier(snap, 2, user_id, roleName) ||
      !levels.includes(2)
    ) {
      throw {
        status: 400,
        message:
          "User role not authorized to decline request at this stage",
      };
    }
  } else {
    throw {
      status: 400,
      message:
        "Request is not awaiting N1/N2 authorization at this status",
    };
  }
}

/**
 * Approves a travel request (monto máximo por rol + escalamiento M2-005).
 *
 * @param {number} request_id
 * @param {number} user_id
 * @returns {Promise<{ new_status: string, outcome: 'APROBADO' | 'ESCALADO' }>}
 */
const authorizeRequest = async (request_id, user_id) => {
  const ctx = await Authorizer.getRequestAuthorizationContext(request_id);
  if (!ctx) {
    throw { status: 404, message: "Request not found" };
  }

  const roleName = await Authorizer.getUserRoleName(user_id);
  if (!roleName) {
    throw { status: 404, message: "User not found" };
  }

  // M2-006 RF-45: bloquear aprobación si hay excepciones de política pendientes.
  try {
    const pending = await policyExceptionService.listPendingForRequest(request_id);
    if (pending && pending.length > 0) {
      throw {
        status: 409,
        message: "Resuelva las excepciones de política pendientes antes de aprobar la solicitud.",
      };
    }
  } catch (e) {
    if (e && e.status) throw e;
    // Si la consulta falla por motivos de infra, no bloqueamos la aprobación
    // (defense-in-depth: el chequeo es preventivo, no autoridad final).
    console.warn("authorizerService: pending exception check failed:", e?.message || e);
  }

  const snap = ctx.workflowPreSnapshot;
  const levels =
    snap && typeof snap === "object" && Array.isArray(snap.levels)
      ? snap.levels
      : [1, 2];

  const amount = requestAmount(ctx);
  const maxAmount = await Authorizer.getUserMaxApprovalAmount(user_id);

  if (ctx.requestStatusId === 2) {
    const canAct = await canActOnTier(ctx, 1, user_id, roleName);
    if (
      !canAct ||
      !levels.includes(1)
    ) {
      throw {
        status: 400,
        message:
          "User role not authorized to approve request at this stage",
      };
    }

    if (amountExceedsLimit(amount, maxAmount)) {
      if (!levels.includes(2)) {
        throw {
          status: 409,
          message:
            "El monto supera el tope de aprobación y no hay un nivel superior configurado para escalar.",
        };
      }
      await Authorizer.applyWorkflowAction(
        request_id,
        { statusId: 3 },
        user_id,
        SolicitudHistorialAccion.ESCALADO,
        null,
      );
      return {
        new_status: labelForStatusId(3),
        outcome: "ESCALADO",
      };
    }

    const new_status_id = statusAfterN1Approval(levels);
    await Authorizer.applyWorkflowAction(
      request_id,
      { statusId: new_status_id },
      user_id,
      SolicitudHistorialAccion.APROBADO,
      null,
    );
    await emitAnticipoPolizaIfApproved(request_id, new_status_id);
    return {
      new_status: labelForStatusId(new_status_id),
      outcome: "APROBADO",
    };
  }

  if (ctx.requestStatusId === 3) {
    const canAct = await canActOnTier(ctx, 2, user_id, roleName);
    if (
      !canAct ||
      !levels.includes(2)
    ) {
      throw {
        status: 400,
        message:
          "User role not authorized to approve request at this stage",
      };
    }

    if (amountExceedsLimit(amount, maxAmount)) {
      throw {
        status: 409,
        message:
          "El monto supera el tope de aprobación de este nivel y no hay más niveles configurados.",
      };
    }

    const new_status_id = statusAfterN2Approval();
    await Authorizer.applyWorkflowAction(
      request_id,
      { statusId: new_status_id },
      user_id,
      SolicitudHistorialAccion.APROBADO,
      null,
    );
    await emitAnticipoPolizaIfApproved(request_id, new_status_id);
    return {
      new_status: labelForStatusId(new_status_id),
      outcome: "APROBADO",
    };
  }

  throw {
    status: 400,
    message:
      "Request is not awaiting N1/N2 authorization at this status",
  };
};

/**
 * @param {number} request_id
 * @param {number} user_id
 * @param {string} comentario
 */
const declineRequest = async (request_id, user_id, comentario) => {
  const trimmed =
    typeof comentario === "string" ? comentario.trim() : "";
  if (!trimmed) {
    throw {
      status: 400,
      message: "El comentario es obligatorio para rechazar la solicitud",
    };
  }

  const ctx = await Authorizer.getRequestAuthorizationContext(request_id);
  if (!ctx) {
    throw { status: 404, message: "Request not found" };
  }

  const roleName = await Authorizer.getUserRoleName(user_id);
  if (!roleName) {
    throw { status: 404, message: "User not found" };
  }

  if (!["N1", "N2"].includes(roleName)) {
    throw {
      status: 400,
      message: "User role not authorized to decline request",
    };
  }

  if (useHierarchyApprovalMode()) {
    const tier = ctx.requestStatusId === 2 ? 1 : ctx.requestStatusId === 3 ? 2 : null;
    if (!tier) {
      throw {
        status: 400,
        message: "Request is not awaiting N1/N2 authorization at this status",
      };
    }
    const canAct = await canActOnTier(ctx, tier, user_id, roleName);
    if (!canAct) {
      throw {
        status: 400,
        message: "User role not authorized to decline request at this stage",
      };
    }
  } else {
    ensureTierForDecline(ctx, user_id, roleName);
  }

  await Authorizer.applyWorkflowAction(
    request_id,
    { statusId: 10 },
    user_id,
    SolicitudHistorialAccion.RECHAZADO,
    trimmed,
  );

  return {
    message: "Request declined successfully",
    new_status: "Rechazado",
  };
};

/**
 * Reasigna N1 o N2 en el snapshot sin cambiar estatus.
 * @param {number} request_id
 * @param {number} actor_user_id
 * @param {number} target_user_id
 * @param {string} motivo
 */
const reassignRequest = async (
  request_id,
  actor_user_id,
  target_user_id,
  motivo,
) => {
  const m = typeof motivo === "string" ? motivo.trim() : "";
  if (!m) {
    throw { status: 400, message: "El motivo es obligatorio" };
  }

  const tid = Number(target_user_id);
  if (!Number.isFinite(tid) || tid < 1) {
    throw { status: 400, message: "Usuario destino inválido" };
  }
  if (tid === Number(actor_user_id)) {
    throw {
      status: 400,
      message: "No puede reasignar la tarea al mismo usuario",
    };
  }

  const ctx = await Authorizer.getRequestAuthorizationContext(request_id);
  if (!ctx) {
    throw { status: 404, message: "Request not found" };
  }

  const actorRole = await Authorizer.getUserRoleName(actor_user_id);
  if (!actorRole) {
    throw { status: 404, message: "User not found" };
  }

  const snap =
    ctx.workflowPreSnapshot &&
    typeof ctx.workflowPreSnapshot === "object"
      ? { ...ctx.workflowPreSnapshot }
      : {};
  const levels =
    Array.isArray(snap.levels) && snap.levels.length
      ? snap.levels
      : [1, 2];

  const targetRole = await Authorizer.getUserRoleName(tid);
  if (!targetRole || !["N1", "N2"].includes(targetRole)) {
    throw {
      status: 400,
      message: "El usuario destino debe tener rol N1 o N2",
    };
  }

  if (ctx.requestStatusId === 2) {
    if (
      !authorizerMatchesTier(
        ctx.workflowPreSnapshot,
        1,
        actor_user_id,
        actorRole,
      ) ||
      !levels.includes(1)
    ) {
      throw {
        status: 400,
        message:
          "Solo el aprobador asignado a esta etapa puede reasignar",
      };
    }
    snap.n1UserId = tid;
  } else if (ctx.requestStatusId === 3) {
    if (
      !authorizerMatchesTier(
        ctx.workflowPreSnapshot,
        2,
        actor_user_id,
        actorRole,
      ) ||
      !levels.includes(2)
    ) {
      throw {
        status: 400,
        message:
          "Solo el aprobador asignado a esta etapa puede reasignar",
      };
    }
    snap.n2UserId = tid;
  } else {
    throw {
      status: 400,
      message:
        "La solicitud no está en un estatus que permita reasignación",
    };
  }

  const comentario = `Reasignado a usuario ${tid}. ${m}`;

  await Authorizer.applyWorkflowAction(
    request_id,
    {
      statusId: ctx.requestStatusId,
      workflowPreSnapshot: snap,
    },
    actor_user_id,
    SolicitudHistorialAccion.REASIGNADO,
    comentario,
  );

  return { message: "Tarea reasignada correctamente" };
};

/**
 * Decide a policy exception (M2-006 RF-45). Delegates to policyExceptionService
 * but lives here so the controller layer has a single workflow entry-point.
 * @param {number} exception_id
 * @param {"APPROVED" | "REJECTED"} decision
 * @param {number} user_id
 * @param {string|null} note
 */
const decideException = async (exception_id, decision, user_id, note) => {
  return policyExceptionService.decideException(exception_id, decision, user_id, note);
};

export default {
  authorizeRequest,
  declineRequest,
  reassignRequest,
  decideException,
};
