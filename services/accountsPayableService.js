/**
 * @module accountsPayableService
 * @description Handles business logic for the Accounts Payable workflow,
 * including receipt validation and automatic request-status transitions.
 */
import AccountsPayable from "../models/accountsPayableModel.js";

const AccountsPayableService = {
    /**
     * Checks the receipt statuses for a given request and advances (or rolls back)
     * the request status accordingly:
     * - Any rejected receipt → status 6 (returned to previous step)
     * - All receipts approved → status 8 (Finalizado)
     * - Receipts still pending → no status change
     *
     * @param {number} requestId - ID of the travel request to evaluate
     * @returns {Promise<Object>} Object with updatedStatus (number|null) and a message string
     */
    async validateReceiptsAndUpdateStatus(requestId) {
        const statuses = await AccountsPayable.getReceiptStatusesForRequest(requestId);

        if (statuses.includes("Rechazado")) {
            await AccountsPayable.updateRequestStatus(requestId, 6);
            return {
                updatedStatus: 6,
                message: "Some receipts were rejected. Request moved back to step 6."
            };
        }

        const allApproved = statuses.every(s => s === "Aprobado");
        if (allApproved) {
            await AccountsPayable.updateRequestStatus(requestId, 8); // Finalizado
            return {
                updatedStatus: 8,
                message: "All receipts approved. Request finalized."
            };
        }

        return {
            updatedStatus: null,
            message: "Receipts still pending. No status change applied."
        };
    }
};

export default AccountsPayableService;
