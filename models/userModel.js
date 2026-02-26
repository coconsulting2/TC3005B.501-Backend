import pool from "../database/config/db.js";

const User = {
  /**
   * Get all user data by ID.
   * @param {string|number} userId - User ID.
   * @returns {Promise<Object|undefined>} User row or undefined.
   */
  async getUserData(userId) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        `SELECT 
          u.user_id, 
          u.user_name, 
          u.email, 
          u.phone_number,
          u.workstation,
          d.department_name,
          d.costs_center,
          u.creation_date, 
          r.role_name
        FROM User u
        JOIN Role r ON u.role_id = r.role_id
        JOIN Department d ON u.department_id = d.department_id
        WHERE u.user_id = ?`,
        [userId]
      );

      return rows[0];
    } finally {
      if (conn) conn.release();
    }
  },

  /**
   * Get a travel request by ID with route and location details.
   * @param {string|number} requestId - Request ID.
   * @returns {Promise<Array>} Request rows (ordered by router_index).
   */
  async getTravelRequestById(requestId) {
    let conn;
    const query = `
      SELECT 
        r.request_id,
        rs.status AS request_status,
        r.notes,
        r.requested_fee,
        r.imposed_fee,
        r.request_days,
        r.creation_date,
        u.user_name,
        u.email AS user_email,
        u.phone_number AS user_phone_number,

        ro.router_index,
        co1.country_name AS origin_country,
        ci1.city_name AS origin_city,
        co2.country_name AS destination_country,
        ci2.city_name AS destination_city,

        ro.beginning_date,
        ro.beginning_time,
        ro.ending_date,
        ro.ending_time,
        ro.hotel_needed,
        ro.plane_needed

      FROM Request r
      JOIN User u ON r.user_id = u.user_id
      JOIN Request_status rs ON r.request_status_id = rs.request_status_id
      LEFT JOIN Route_Request rr ON r.request_id = rr.request_id
      LEFT JOIN Route ro ON rr.route_id = ro.route_id
      LEFT JOIN Country co1 ON ro.id_origin_country = co1.country_id
      LEFT JOIN City ci1 ON ro.id_origin_city = ci1.city_id
      LEFT JOIN Country co2 ON ro.id_destination_country = co2.country_id
      LEFT JOIN City ci2 ON ro.id_destination_city = ci2.city_id
      WHERE r.request_id = ?
      ORDER BY ro.router_index ASC
    `;

    try {
      conn = await pool.getConnection();
      const rows = await conn.query(query, [requestId]);
      return rows;
    } catch (error) {
      console.error("Error in getTravelRequestById:", error);
      throw error;
    } finally {
      if (conn) conn.release();
    }
  },

  /**
   * Get travel requests by department and status, optionally limited.
   * @param {string|number} deptId - Department ID.
   * @param {string|number} statusId - Request status ID.
   * @param {number} [n] - Optional limit.
   * @returns {Promise<Array>} Request rows.
   */
  async getTravelRequestsByDeptStatus(deptId, statusId, n) {
    const conn = await pool.getConnection();
    try {
      const baseQuery = `
      SELECT
        r.request_id,
        u.user_id,
        c.country_name AS destination_country,
        ro.beginning_date,
        ro.ending_date,
        rs.status AS request_status
      FROM Request r
      JOIN User u ON r.user_id = u.user_id
      JOIN Request_status rs ON r.request_status_id = rs.request_status_id
      JOIN Route_Request rr ON r.request_id = rr.request_id
      JOIN Route ro ON rr.route_id = ro.route_id
      JOIN Country c ON ro.id_destination_country = c.country_id
      WHERE u.department_id = ?
        AND r.request_status_id = ?
      GROUP BY r.request_id
      ORDER BY r.creation_date DESC
      ${n ? "LIMIT ?" : ""}
    `;

      const params = n ? [deptId, statusId, Number(n)] : [deptId, statusId];
      const rows = await conn.query(baseQuery, params);
      return rows;
    } finally {
      conn.release();
    }
  },

  /**
   * Get user by username (for auth).
   * @param {string} username - Username.
   * @returns {Promise<Object|undefined>} User row or undefined.
   */
  async getUserUsername(username) {
    const connection = await pool.getConnection();
    try {
      const rows = await connection.query(
        `SELECT 
          u.user_name,
          u.user_id,
          u.department_id,
          u.password,
          u.active, 
          r.role_name 
        FROM User u
        JOIN Role r ON u.role_id = r.role_id
        WHERE u.user_name = ?`,
        [username]
      );

      return rows[0];
    } finally {
      connection.release();
    }
  },

  /**
   * Get user wallet by user ID.
   * @param {string|number} userId - User ID.
   * @returns {Promise<Object|undefined>} User row with wallet or undefined.
   */
  async getUserWallet(userId) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        `SELECT 
          user_id,
          user_name,
          wallet
          FROM User
          WHERE user_id = ?`,
        [userId]
      );

      return rows[0];
    } finally {
      if (conn) conn.release();
    }
  },
};

export default User;
