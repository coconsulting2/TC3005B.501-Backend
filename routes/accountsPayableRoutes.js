import express from "express";
const router = express.Router();
import { validateId, validateInputs } from "../middleware/validation.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";
import AccountsPayableController from "../controllers/accountsPayableController.js";

router.use((req, res, next) => {
    next();
});

router.route("/attend-travel-request/:request_id")
    .put(generalRateLimiter, ...requireAuth(["Cuentas por pagar"]), validateId, validateInputs, AccountsPayableController.attendTravelRequest);

router.route("/validate-receipts/:request_id")
    .put(generalRateLimiter, ...requireAuth(["Cuentas por pagar"]), validateId, validateInputs, AccountsPayableController.validateReceiptsHandler);

router.route("/validate-receipt/:receipt_id")
    .put(generalRateLimiter, ...requireAuth(["Cuentas por pagar"]), validateId, validateInputs, AccountsPayableController.validateReceipt);

router.route("/get-expense-validations/:request_id")
    .get(generalRateLimiter, ...requireAuth(["Cuentas por pagar", "Solicitante", "N1", "N2"]), validateId, validateInputs, AccountsPayableController.getExpenseValidations);

export default router;
