/*
Applicant Routes
*/
import express from "express";
const router = express.Router();
import applicantController from "../controllers/applicantController.js";
import { validateId, validateTravelRequest, validateExpenseReceipts, validateInputs, validateDraftTravelRequest } from "../middleware/validation.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

router.use((req, res, next) => {
    next();
});

router.route("/:id")
    .get(generalRateLimiter, ...requirePermission("travel_request:view_own"), validateId, validateInputs, applicantController.getApplicantById);

// Route to get cost center by user ID
router.route("/get-cc/:user_id")
    .get(generalRateLimiter, ...requirePermission("travel_request:view_own"), validateId, validateInputs, applicantController.getCostCenterByUserId);

router.route("/create-travel-request/:user_id")
    .post(generalRateLimiter, ...requirePermission("travel_request:create"), validateId, validateTravelRequest, validateInputs, applicantController.createTravelRequest);

router.route("/edit-travel-request/:user_id")
    .put(generalRateLimiter, ...requirePermission("travel_request:edit_own"), validateId, validateTravelRequest, validateInputs, applicantController.editTravelRequest);

router.route("/cancel-travel-request/:request_id")
    .put(generalRateLimiter, ...requirePermission("travel_request:cancel"), validateId, validateInputs, applicantController.cancelTravelRequest);

router.route("/create-expense-validation")
    .post(generalRateLimiter, ...requirePermission("expense:submit"), validateExpenseReceipts, validateInputs, applicantController.createExpenseValidationHandler);

router.route("/get-completed-requests/:user_id")
    .get(generalRateLimiter, ...requirePermission("travel_request:view_own"), validateId, validateInputs, applicantController.getCompletedRequests);

router.route("/get-user-request/:user_id")
    .get(generalRateLimiter, ...requirePermission("travel_request:view_any"), validateId, validateInputs, applicantController.getApplicantRequest);

router.route("/get-user-requests/:user_id")
    .get(generalRateLimiter, ...requirePermission("travel_request:view_any"), validateId, validateInputs, applicantController.getApplicantRequests);

router.route("/create-draft-travel-request/:user_id")
    .post(generalRateLimiter, ...requirePermission("travel_request:create"), validateId, validateDraftTravelRequest, validateInputs, applicantController.createDraftTravelRequest);

router.route("/confirm-draft-travel-request/:user_id/:request_id")
    .put(generalRateLimiter, ...requirePermission("travel_request:submit"), validateId, validateInputs, applicantController.confirmDraftTravelRequest);

router.route("/send-expense-validation/:request_id")
    .put(generalRateLimiter, ...requirePermission("expense:submit"), validateId, validateInputs, applicantController.sendExpenseValidation);

router.route("/delete-receipt/:receipt_id")
    .delete(generalRateLimiter, ...requirePermission("receipt:delete_own"), validateId, validateInputs, applicantController.deleteReceipt);

export default router;
