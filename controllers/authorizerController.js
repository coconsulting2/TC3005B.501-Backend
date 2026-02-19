/**
 * @module authorizerController
 * @description Handles HTTP requests for travel request authorization (approve/decline).
 */
import Authorizer from "../models/authorizerModel.js";
import authorizerServices from "../services/authorizerService.js";
import { Mail } from "../services/email/mail.cjs";
import mailData from "../services/email/mailData.js";

/**
 * Retrieves pending alerts for a department filtered by status.
 * @param {import('express').Request} req - Express request (params: dept_id, status_id, n)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON array of alerts or 404/500 error
 */
const getAlerts = async (req, res) => {
  const id = Number(req.params.dept_id);
  const status = Number(req.params.status_id);
  const n = Number(req.params.n);
  try {
    const userRequest = await Authorizer.getAlerts(id, status, n);
    if (!userRequest) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json(userRequest);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Approves a travel request and advances it to the next status. Sends email notification.
 * @param {import('express').Request} req - Express request (params: request_id, user_id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with success message and new status
 */
const authorizeTravelRequest = async (req, res) => {
  const { request_id, user_id } = req.params;

  try {
    const { new_status } = await authorizerServices.authorizeRequest(Number(request_id), Number(user_id));
    const { user_email, user_name, requestId, status } = await mailData(request_id);
    await Mail(user_email, user_name, request_id, status);
    return res.status(200).json({
      message: "Request status updated successfully",
      new_status
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Unexpected error in authorizeTravelRequest controller:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Declines a travel request and sends email notification.
 * @param {import('express').Request} req - Express request (params: request_id, user_id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with decline result
 */
const declineTravelRequest = async (req, res) => {
  const { request_id, user_id } = req.params;

  try {
    const result = await authorizerServices.declineRequest(Number(request_id), Number(user_id));
    const { user_email, user_name, requestId, status } = await mailData(request_id);
    await Mail(user_email, user_name, request_id, status);
    return res.status(200).json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Unexpected error in declineTravelRequest controller:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export default {
  getAlerts,
  authorizeTravelRequest,
  declineTravelRequest,
};
