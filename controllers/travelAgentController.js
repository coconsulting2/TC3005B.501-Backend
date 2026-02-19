/**
 * @module travelAgentController
 * @description Handles HTTP requests for travel agent operations.
 * @author Miguel Soria
 */
import TravelAgent from "../models/travelAgentModel.js";
import { Mail } from "../services/email/mail.cjs";
import mailData from "../services/email/mailData.js";

/**
 * Attends a travel request by advancing its status from travel agency to completed.
 * Sends email notification upon success.
 * @param {import('express').Request} req - Express request (params: request_id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with new status or 404/400/500 error
 */
const attendTravelRequest = async (req, res) => {
    const requestId = req.params.request_id;

    try {
        const exists = await TravelAgent.requestExists(requestId);
        if (!exists) {
            return res.status(404).json({ error: "Travel request not found" });
        }

        const updated = await TravelAgent.attendTravelRequest(requestId);

        if (!updated) {
            return res.status(400).json({ error: "Failed to update travel request status" });
        }

        const { user_email, user_name, request_id, status } = await mailData(requestId);
        await Mail(user_email, user_name, request_id, status);

        return res.status(200).json({
            message: "Travel request status updated successfully",
            requestId: requestId,
            newStatus: 6,
        });
    } catch (error) {
        console.error("Error in attendTravelRequest controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export default {
    attendTravelRequest,
};
