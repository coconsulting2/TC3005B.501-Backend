/**
 * CPP model with queries related to accounts payable actions.
 * Author: Miguel Soria (09/05/25)
 *
 * @module models/accountsPayableModel
 */
import pool from "../database/config/db.js";

const AccountsPayable = {
    /**
     * Update a travel request status and imposed fee.
     *
     * @async
     * @param {number} requestId - Identifier of the travel request.
     * @param {number} imposedFee - Imposed fee for the request.
     * @param {number} newStatus - New status identifier to set.
     * @returns {Promise<boolean>} True if the update affected at least one row.
     */
    async attendTravelRequest(requestId, imposedFee, newStatus) {
        let conn;
        try {
            conn = await pool.getConnection();
            const result = await conn.query(
                `UPDATE Request SET request_status_id = ?, imposed_fee = ? 
                WHERE request_id = ?`,
                [newStatus, imposedFee, requestId],
            );

            return result.affectedRows > 0;
        } catch (error) {
            console.error("Error updating travel request status:", error);
            throw error;
        } finally {
            if (conn) {
                conn.release();
            }
        }
    },

    /**
     * Check if a request exists in the database.
     *
     * @async
     * @param {number} requestId - Identifier of the request to check.
     * @returns {Promise<Object|undefined>} Request record if found, otherwise undefined.
     */
    async requestExists(requestId) {
        let conn;
        try {
            conn = await pool.getConnection();
            const rows = await conn.query(
                 `SELECT request_id, request_status_id, hotel_needed_list, plane_needed_list 
                 FROM RequestWithRouteDetails WHERE request_id = ?`,
                [requestId],
            );
            return rows[0];
        } catch (error) {
            console.error("Error checking if request exists:", error);
            throw error;
        } finally {
            if (conn) {
                conn.release();
            }
        }
    },
  
    /**
     * Get the validation statuses of receipts for a request.
     *
     * @async
     * @param {number} requestId - Identifier of the request.
     * @returns {Promise<Array<string>>} List of validation statuses.
     */
    async getReceiptStatusesForRequest(requestId) {
        let conn;
        const query = `
            SELECT validation FROM Receipt
            WHERE request_id = ?
        `;

        try {
            conn = await pool.getConnection();
            const rows = await conn.query(query, [requestId]);
            return rows.map(r => r.validation);
        } catch (error) {
            console.error('Error fetching receipt statuses:', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    },

    /**
     * Update the status of a request.
     *
     * @async
     * @param {number} requestId - Identifier of the request to update.
     * @param {number} statusId - New status identifier to set.
     * @returns {Promise<void>} Resolves when the update is complete.
     */
    async updateRequestStatus(requestId, statusId) {
        let conn;
        const query = `
            UPDATE Request
            SET request_status_id = ?
            WHERE request_id = ?
        `;

        try {
            conn = await pool.getConnection();
            await conn.query(query, [statusId, requestId]);
        } catch (error) {
            console.error('Error updating request status:', error);
            throw error;
        } finally {
            if (conn) conn.release();
        }
    },

    /**
     * Check if a receipt exists in the database.
     *
     * @async
     * @param {number} receiptId - Identifier of the receipt to check.
     * @returns {Promise<Object|undefined>} Receipt record if found, otherwise undefined.
     */
    async receiptExists(receiptId) {
        let conn;
        try {
            conn = await pool.getConnection();
            const rows = await conn.query(
                "SELECT receipt_id, validation FROM `Receipt` WHERE receipt_id = ?",
                [receiptId],
            );
            return rows[0];
        } catch (error) {
            console.error("Error checking if receipt exists:", error);
            throw error;
        } finally {
            if (conn) {
                conn.release();
            }
        }
    },

    /**
     * Validate (approve or reject) a receipt.
     *
     * @async
     * @param {number} requestId - Identifier of the receipt to validate.
     * @param {string} approval - Validation status to set.
     * @returns {Promise<boolean>} True if the update affected at least one row.
     */
    async validateReceipt(requestId, approval) {
        let conn;
        try {
            conn = await pool.getConnection();
            const result = await conn.query(
                `UPDATE Receipt
                SET validation = ? WHERE receipt_id = ?`,
                [approval, requestId],
            );

            return result.affectedRows > 0;
        } catch (error) {
            console.error("Error updating receipt status:", error);
            throw error;
        } finally {
            if (conn) {
                conn.release();
            }
        }
    },

    /**
     * Get expense validations for a given request.
     *
     * @async
     * @param {number} requestId - Identifier of the request.
     * @returns {Promise<Object>} Structured expense validation summary.
     */
    async getExpenseValidations(requestId) {
        let conn;
        try {
            conn = await pool.getConnection();

            let query;

            query = `
            SELECT
                r.receipt_id,
                r.request_id,
                r.validation,
                r.amount,
                rt.receipt_type_name,
                r.pdf_file_id,
                r.pdf_file_name,
                r.xml_file_id,
                r.xml_file_name
            FROM
                Receipt r
            JOIN
                Receipt_Type rt ON r.receipt_type_id = rt.receipt_type_id
            WHERE
                r.request_id = ?
        `;

            // Execute the query with the requestId
            const rows = await conn.query(query, [requestId]);

            if (rows.length === 0) {
                return {
                    request_id: requestId,
                    Expenses: []
                };
            }

            // Check if any of the rows have validation 'Pendiente'
            const hasPendingValidation = rows.some(row => row.validation === 'Pendiente');
            const expense_status = hasPendingValidation ? 'Pendiente' : 'Sin Pendientes';

            // Sort the rows based on the validation status
            rows.sort((a, b) => {
                // Define the order for sorting
                const statusOrder = { "Pendiente": 1, "Rechazado": 2, "Aprobado": 3 };
                return statusOrder[a.validation] - statusOrder[b.validation];
            });
            // Format the response
            const formatted = {
                request_id: requestId,
                status: expense_status,
                Expenses: rows.map(row => ({
                    receipt_id: row.receipt_id,
                    receipt_type_name: row.receipt_type_name,
                    amount: row.amount, // Now including the amount field
                    validation: row.validation, // We use the validation as Expense_Status
                    pdf_id: row.pdf_file_id,
                    pdf_name: row.pdf_file_name,
                    xml_id: row.xml_file_id,
                    xml_name: row.xml_file_name
                }))
            };

            return formatted;

        } catch (error) {
            console.error("Error getting expense validations:", error);
            throw error;
        } finally {
            if (conn) {
                conn.release();
            }
        }
    },

};

export default AccountsPayable;
