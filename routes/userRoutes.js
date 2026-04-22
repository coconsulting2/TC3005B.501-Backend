import express from "express";
const router = express.Router();
import * as userController from "../controllers/userController.js";
import { validateId, validateInputs, validateDeptStatus } from "../middleware/validation.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { loadPermissions, requirePermission } from "../middleware/permissionMiddleware.js";
import { loginRateLimiter, generalRateLimiter } from "../middleware/rateLimiters.js";

router.route("/get-user-data/:user_id")
    .get(generalRateLimiter, ...requirePermission("user:view_self"), validateId, validateInputs, userController.getUserData);

router.route("/login")
    .post(loginRateLimiter, userController.login);

router.route("/logout")
    .get(userController.logout);

router.route("/me/permissions")
    .get(generalRateLimiter, authenticateToken, loadPermissions, userController.getMyPermissions);

router.route("/get-travel-request/:request_id")
    .get(generalRateLimiter, ...requirePermission("travel_request:view_any"), validateId, validateInputs, userController.getTravelRequestById);

router.route("/get-travel-requests/:dept_id/:status_id/:n?")
    .get(generalRateLimiter, ...requirePermission("travel_request:view_any"), validateDeptStatus, validateInputs, userController.getTravelRequestsByDeptStatus);

router.route("/get-user-wallet/:user_id?")
    .get(generalRateLimiter, ...requirePermission("user:view_self"), validateId, validateInputs, userController.getUserWallet);

export default router;
