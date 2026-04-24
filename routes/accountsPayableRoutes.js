import express from "express";
const router = express.Router();
import { validateId, validateInputs } from "../middleware/validation.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";
import AccountsPayableController from "../controllers/accountsPayableController.js";
import AccountingExportController from "../controllers/accountingExportController.js";

router.use((req, res, next) => {
    next();
});

router.route("/attend-travel-request/:request_id")
    .put(generalRateLimiter, ...requirePermission("accounts_payable:attend"), validateId, validateInputs, AccountsPayableController.attendTravelRequest);

router.route("/validate-receipts/:request_id")
    .put(generalRateLimiter, ...requirePermission("receipt:validate"), validateId, validateInputs, AccountsPayableController.validateReceiptsHandler);

router.route("/validate-receipt/:receipt_id")
    .put(generalRateLimiter, ...requirePermission("receipt:validate"), validateId, validateInputs, AccountsPayableController.validateReceipt);

router.route("/get-expense-validations/:request_id")
    .get(generalRateLimiter, ...requirePermission("expense:view"), validateId, validateInputs, AccountsPayableController.getExpenseValidations);

router.route("/accounting-export/:request_id")
    .get(generalRateLimiter, ...requirePermission("accounting:export"), validateId, validateInputs, AccountingExportController.exportByRequest);

router.route("/accounting-export")
    .get(generalRateLimiter, ...requirePermission("accounting:export"), AccountingExportController.exportByRange);

export default router;
