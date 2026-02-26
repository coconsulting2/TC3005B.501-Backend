/**
 * @module authorizerModel
 * @description Data access layer for authorizer-related database operations.
 */
import pool from "../database/config/db.js";

const Authorizer = {
  /**
   * Retrieve alerts for a department filtered by request status.
   * @param {number} id - Department ID.
   * @param {number} statusId - Request status ID to filter by.
   * @param {number} n - Max number of alerts to return (0 = no limit).
   * @returns {Promise<Array<Object>>} Alert rows.
   */
  async getAlerts(id, statusId, n) {
    let conn;
    // When n is 0, return all rows; otherwise apply LIMIT
    const query = `
        SELECT Alert.alert_id, User.user_name, Alert.request_id, AlertMessage.message_text, DATE(Alert.alert_date) AS alert_date, TIME(Alert.alert_date) AS alert_time
        FROM Alert
        INNER JOIN Request ON Alert.request_id = Request.request_id
        INNER JOIN User ON Request.user_id = User.user_id
        INNER JOIN Request_status ON Request.request_status_id = Request_status.request_status_id
        INNER JOIN AlertMessage ON Alert.message_id = AlertMessage.message_id
        WHERE User.department_id = ? AND Request_status.request_status_id = ?
        ${n === 0 ? "ORDER BY alert_date DESC;" : "ORDER BY alert_date DESC LIMIT ?;"}`;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(query, [id, statusId, n]);
      return rows;
    } catch (error) {
      console.error("Error getting completed requests:", error);
      throw error;
    } finally {
      if (conn) {
        conn.release();
      }
    }
  },

  /**
   * Get the role ID for a given user.
   * @param {number} userId - User ID.
   * @returns {Promise<number|null>} Role ID or null if not found.
   */
  async getUserRole(userId) {
    let conn;
    const query = `
        SELECT role_id FROM User WHERE user_id = ?
      `;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(query, [userId]);
      if (rows.length > 0) {
        return rows[0].role_id;
      } else {
        return null;
      }
    } catch (error) {
      console.error("Error getting user role:", error);
      throw error;
    } finally {
      if (conn) conn.release();
    }
  },

  /**
   * Update a travel request status (approve flow).
   * @param {number} requestId - Request ID.
   * @param {number} statusId - New status ID to set.
   * @returns {Promise<Object>} Query result.
   */
  async authorizeTravelRequest(requestId, statusId) {
    let conn;
    const query = `
            UPDATE Request
            SET request_status_id = ?
            WHERE request_id = ?
        `;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(query, [statusId, requestId]);
      return rows;
    } catch (error) {
      console.error("Error getting completed requests:", error);
      throw error;
    } finally {
      if (conn) {
        conn.release();
      }
    }
  },

  /**
   * Decline a travel request by setting its status to 10.
   * @param {number} requestId - Request ID.
   * @returns {Promise<boolean>} True if the query executed successfully.
   */
  async declineTravelRequest(requestId) {
    let conn;
    const query = `
            UPDATE Request
            SET request_status_id = 10
            WHERE request_id = ?
        `;
    try {
      conn = await pool.getConnection();

      await conn.query(query, [requestId]);

      return true;
    } catch (error) {
      console.error("Error getting completed requests:", error);
      throw error;
    } finally {
      if (conn) {
        conn.release();
      }
    }
  },
};

export default Authorizer;
