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

  const snap = ctx.workflowPreSnapshot;
  const levels =
    snap && typeof snap === "object" && Array.isArray(snap.levels)
      ? snap.levels
      : [1, 2];

  const amount = requestAmount(ctx);
  const maxAmount = await Authorizer.getUserMaxApprovalAmount(user_id);

  if (ctx.requestStatusId === 2) {
    if (
      !authorizerMatchesTier(snap, 1, user_id, roleName) ||
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
    return {
      new_status: labelForStatusId(new_status_id),
      outcome: "APROBADO",
    };
  }

  if (ctx.requestStatusId === 3) {
    if (
      !authorizerMatchesTier(snap, 2, user_id, roleName) ||
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

  ensureTierForDecline(ctx, user_id, roleName);

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

export default {
  authorizeRequest,
  declineRequest,
  reassignRequest,
};
