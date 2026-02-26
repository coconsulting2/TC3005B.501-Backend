/**
 * @module authorizerService
 * @description Handles authorization workflows for travel requests,
 * including approval and rejection by N1/N2 roles.
 */
import Authorizer from "../models/authorizerModel.js";

/**
 * Approves a travel request, advancing its status based on the authorizer's role.
 * N1 (role 4) moves the request to "Segunda Revision", N2 (role 5) to "Cotizacion de Viaje".
 *
 * @param {number} request_id - ID of the travel request to approve
 * @param {number} user_id - ID of the authorizing user
 * @returns {Promise<Object>} Object with the new status label
 */
const authorizeRequest = async (request_id, user_id) => {
  try {
    const role_id = await Authorizer.getUserRole(user_id);
    if (!role_id) {
      throw { status: 404, message: "User not found" };
    }

    let new_status_id;
    if (role_id === 4) {
      new_status_id = 3; // N1 -> Primera Revision
    } else if (role_id === 5) {
      new_status_id = 4; // N2 -> Segunda Revision
    } else {
      throw { status: 400, message: "User role not authorized to approve request" };
    }

    await Authorizer.authorizeTravelRequest(request_id, new_status_id);

    return {
      new_status: role_id === 4 ? "Segunda Revisión" : "Cotizacion de Viaje"
    };

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
    const role_id = await Authorizer.getUserRole(user_id);
    if (!role_id) {
      throw { status: 404, message: "User not found" };
    }

    if (![4, 5].includes(role_id)) {
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
