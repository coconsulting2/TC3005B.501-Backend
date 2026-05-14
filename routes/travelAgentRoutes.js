/*
Travel Agent Routes
Miguel Soria 26/04/25
Routes for travel agent
*/
import express from "express";
const router = express.Router();
import travelAgentController from "../controllers/travelAgentController.js";
import { validateId, validateInputs } from "../middleware/validation.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

router.use((req, res, next) => {
    next();
});

// Route to attend a travel request (update status to 4)
router.route("/attend-travel-request/:request_id")
    .put(generalRateLimiter, ...requirePermission("travel_agent:attend"), validateId, validateInputs, travelAgentController.attendTravelRequest);

// TF-010 — persistir oferta de vuelo seleccionada
router.route("/travel-request/:request_id/selected-flight")
    .put(generalRateLimiter, ...requirePermission("travel_agent:attend"), validateId, validateInputs, travelAgentController.saveSelectedFlightOffer);

router.route("/travel-request/:request_id/selected-hotel")
    .put(generalRateLimiter, ...requirePermission("travel_agent:attend"), validateId, validateInputs, travelAgentController.saveSelectedHotelOffer);

export default router;
