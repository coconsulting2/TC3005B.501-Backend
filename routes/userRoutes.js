import express from "express";
const router = express.Router();
import * as userController from "../controllers/userController.js";
import { validateId, validateInputs, validateDeptStatus, validateApproverStatus } from "../middleware/validation.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { loadPermissions, requireAnyPermission, requirePermission } from "../middleware/permissionMiddleware.js";
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
    .get(
      generalRateLimiter,
      ...requireAnyPermission("travel_request:view_any", "travel_agent:attend"),
      validateId,
      validateInputs,
      userController.getTravelRequestById
    );

/**
 * @deprecated Filtra por departamento del solicitante. Usar
 * `/get-approver-requests/:status_id/:n?` que filtra por aprobador esperado
 * (snapshot/jerarquía). Se conserva por compatibilidad de consumidores.
 */
router.route("/get-travel-requests/:dept_id/:status_id/:n?")
    .get(
      generalRateLimiter,
      ...requireAnyPermission(
        "travel_request:view_any",
        "travel_agent:attend",
        "travel_request:authorize",
      ),
      validateDeptStatus,
      validateInputs,
      userController.getTravelRequestsByDeptStatus
    );

router.route("/get-approver-requests/:status_id/:n?")
    .get(
      generalRateLimiter,
      ...requireAnyPermission(
        "travel_request:view_any",
        "travel_agent:attend",
        "travel_request:authorize",
      ),
      validateApproverStatus,
      validateInputs,
      userController.getTravelRequestsForApprover
    );

router.route("/get-user-wallet/:user_id?")
    .get(generalRateLimiter, ...requirePermission("user:view_self"), validateId, validateInputs, userController.getUserWallet);

export default router;
