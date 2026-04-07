/**
 * @module travelAgentController
 * @description Handles HTTP requests for travel agent operations.
 * @author Miguel Soria
 */
import { attendTravelRequest as attendTravelRequestService } from "../services/travelAgentService.js";
import { Mail } from "../services/email/mail.cjs";
import mailData from "../services/email/mailData.js";
import logger from "../services/logger.js";

/**
 * Attends a travel request by advancing its status from 5 to 6.
 * Validates current status and hotel/plane requirements via the service layer.
 * Sends email notification upon success.
 * @param {import('express').Request} req - Express request (params: request_id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with new status or 404/400/500 error
 */
const attendTravelRequest = async (req, res) => {
    const requestId = req.params.request_id;

    try {
        const result = await attendTravelRequestService(requestId);

        const { user_email, user_name, request_id, status } = await mailData(requestId);
        await Mail(user_email, user_name, request_id, status);

        return res.status(200).json({
            message: "Travel request status updated successfully",
            requestId: result.requestId,
            newStatus: result.newStatusId,
            needsHotel: result.needsHotel,
            needsPlane: result.needsPlane,
        });
    } catch (error) {
        logger.error("Error in attendTravelRequest controller: %s", error.message);
        const statusCode = error.status || 500;
        const message = statusCode < 500 ? error.message : "Internal server error";
        return res.status(statusCode).json({ error: message });
    }
};

export default {
    attendTravelRequest,
};
