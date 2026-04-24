/**
 * @module authorizerService
 * @description Handles authorization workflows for travel requests,
 * including approval and rejection by N1/N2 roles.
 */
import Authorizer from "../models/authorizerModel.js";
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
  const designated = snapshot && typeof snapshot === "object" ? snapshot[key] : null;
  if (designated != null) {
    return Number(designated) === Number(authorId);
  }
  if (tier === 1) return roleName === "N1";
  if (tier === 2) return roleName === "N2";
  return false;
}

/**
 * Approves a travel request, advancing its status based on the authorizer's role
 * y la ruta almacenada en workflow_pre_snapshot (M2-004) si existe.
 *
 * @param {number} request_id - ID of the travel request to approve
 * @param {number} user_id - ID of the authorizing user
 * @returns {Promise<Object>} Object with the new status label
 */
const authorizeRequest = async (request_id, user_id) => {
  try {
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

    let new_status_id;

    if (ctx.requestStatusId === 2) {
      if (!authorizerMatchesTier(snap, 1, user_id, roleName) || !levels.includes(1)) {
        throw {
          status: 400,
          message: "User role not authorized to approve request at this stage",
        };
      }
      new_status_id = statusAfterN1Approval(levels);
    } else if (ctx.requestStatusId === 3) {
      if (!authorizerMatchesTier(snap, 2, user_id, roleName) || !levels.includes(2)) {
        throw {
          status: 400,
          message: "User role not authorized to approve request at this stage",
        };
      }
      new_status_id = statusAfterN2Approval();
    } else {
      throw {
        status: 400,
        message: "Request is not awaiting N1/N2 authorization at this status",
      };
    }

    await Authorizer.authorizeTravelRequest(request_id, new_status_id);

    let label;
    if (new_status_id === 3) label = "Segunda Revisión";
    else if (new_status_id === 4) label = "Cotización del Viaje";
    else label = "Actualizado";

    return { new_status: label };

  } catch (error) {
    console.error("Error in authorizeRequest service:", error);
    throw error;
  }
};

/**
 * Declines a travel request. Only N1 (role 4) and N2 (role 5) users
 * are authorized to perform this action.
 *
 * @param {number} request_id - ID of the travel request to decline
 * @param {number} user_id - ID of the authorizing user
 * @returns {Promise<Object>} Object with a confirmation message and the new status
 */
const declineRequest = async (request_id, user_id) => {
  try {
    const roleName = await Authorizer.getUserRoleName(user_id);
    if (!roleName) {
      throw { status: 404, message: "User not found" };
    }

    if (!["N1", "N2"].includes(roleName)) {
      throw { status: 400, message: "User role not authorized to decline request" };
    }

    await Authorizer.declineTravelRequest(request_id);

    return {
      message: "Request declined successfully",
      new_status: "Rechazado"
    };
  } catch (error) {
    console.error("Error in declineRequest service:", error);
    throw error;
  }
};

export default {
  authorizeRequest,
  declineRequest,
};
