/**
 * @module mailData
 * @description Fetches the travel request and user data needed to populate email notifications.
 */
import pool from "../../database/config/db.js";
import { decrypt } from "../../middleware/decryption.js";

/**
 * Retrieves user contact details and request status for a given travel request.
 * Decrypts the user's email before returning so it can be used directly by the mailer.
 * @param {string|number} request_id - ID of the travel request to look up
 * @returns {Promise<{user_email: string, user_name: string, request_id: number, status: string}>} Mail payload
 * @throws {Error} If the query fails or the request is not found
 */
async function getMailDetails(request_id) {
    let conn;
    const query = `
    SELECT user_email,
        user_name,
        request_id,
        status
    FROM RequestWithRouteDetails
    WHERE request_id = ?
    `;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(query, [request_id]);
        return {
            "user_email": decrypt(rows[0].user_email),
            "user_name": rows[0].user_name,
            "request_id": rows[0].request_id,
            "status": rows[0].status,
        };
    } catch (error) {
        console.error("Error fetching mail data:", error);
        throw error;
    } finally {
        if (conn) {
            conn.release();
        }
    }
}

export default getMailDetails;
