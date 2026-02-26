/**
 * Admin model for user management operations.
 *
 * @module models/adminModel
 */
import pool from '../database/config/db.js';

const Admin = {
  /**
   * Retrieve the list of active users ordered by department.
   *
   * @async
   * @returns {Promise<Array<Object>>} List of active users.
   */
  async getUserList() {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(`SELECT * FROM UserFullInfo 
        WHERE active = 1 ORDER BY department_id`);
      return rows;
      
    } catch (error) {
      console.error('Error finding applicant by ID:', error);
      throw error;
    } finally {
      if (conn){
        conn.release();
      } 
    }
  },
  /**
   * Create multiple users in bulk.
   *
   * @async
   * @param {Array<Object>} users - Array of user objects to create.
   * @returns {Promise<number>} Number of affected rows.
   */
  async createMultipleUsers(users) {
      let conn;

      const values = users.map(user => [
          user.role_id,
          user.department_id,
          user.user_name,
          user.password,
          user.workstation,
          user.email,
          user.phone_number
      ]);

      const query = `INSERT INTO User (role_id, department_id, user_name, password, workstation, email, phone_number) VALUES (?, ?, ?, ?, ?, ?, ?)`;

      try {
          conn = await pool.getConnection();
          const result = await conn.batch(query, values);
          return result.affectedRows;
      } catch (error) {
          console.error('Error getting completed requests:', error);
          throw error;
      } finally {
          if (conn){
              conn.release();
          } 
      }
  },

  /**
   * Find the role ID for a given role name.
   *
   * @async
   * @param {string} roleName - Name of the role.
   * @returns {Promise<number|null>} Role ID if found, otherwise null.
   */
  async findRoleId(roleName) {
      let conn;
      try {
          conn = await pool.getConnection();
          const name = await conn.query('SELECT role_id FROM Role WHERE role_name = ?', [roleName]);
          if (name && name.length > 0) {
              return name[0].role_id;
          }
          return null;
      } catch (error) {
            console.error('Error finding role ID for %s:', roleName, error);
          throw error;
      } finally {
          if (conn) conn.release();
      }
  },

  /**
   * Find the department ID for a given department name.
   *
   * @async
   * @param {string} departmentName - Name of the department.
   * @returns {Promise<number|null>} Department ID if found, otherwise null.
   */
  async findDepartmentId(departmentName) {
      let conn;
      try {
          conn = await pool.getConnection();
          const name = await conn.query('SELECT department_id FROM Department WHERE department_name = ?', [departmentName]);

          if (name && name.length > 0) {
              return name[0].department_id;
          }
          return null;
      } catch (error) {
            console.error('Error finding department ID for %s:', departmentName, error);
          throw error;
      } finally {
          if (conn) conn.release();
      }
  },

  /**
   * Check if a user with the given email exists.
   *
   * @async
   * @param {string} email - Email address to search for.
   * @returns {Promise<boolean>} True if the user exists, otherwise false.
   */
  async findUserByEmail(email) {
      let conn;
      try {
          conn = await pool.getConnection();
          const rows = await conn.execute('SELECT user_id FROM User WHERE email = ?', [email]);

          if (rows && rows.length > 0) {
              return true;
          } else if (rows === undefined || rows === null) {
                return false;
          }

          return false;
      } catch (error) {
          console.error('Database Error in findUserByEmail:', error);
          throw error;
      } finally {
          if (conn) conn.release();
      }
  },

  /**
   * Create a single user, ensuring there is no existing user with the same
   * email or username.
   *
   * @async
   * @param {Object} userData - Data for the user to create.
   * @param {number} userData.role_id - Role identifier.
   * @param {number} userData.department_id - Department identifier.
   * @param {string} userData.user_name - Username.
   * @param {string} userData.password - User password (already processed if needed).
   * @param {string} userData.workstation - User workstation.
   * @param {string} userData.email - User email.
   * @param {string} userData.phone_number - User phone number.
   * @returns {Promise<void>} Resolves when the user has been created.
   */
  async createUser(userData) {
    const connection = await pool.getConnection();
    try{
      const existingUser = await connection.query(
        `SELECT
        user_id
        FROM User
        WHERE email = ? OR user_name = ?`,
        [userData.email, userData.user_name]
      );

      if (existingUser.length > 0) {
          throw new Error('User with this email or username already exists');
      }

      await connection.query(
        `INSERT INTO User (
          role_id,
          department_id,
          user_name,
          password,
          workstation,
          email,
          phone_number,
          creation_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          userData.role_id,
          userData.department_id,
          userData.user_name,
          userData.password,
          userData.workstation,
          userData.email,
          userData.phone_number
        ]
      );
    } finally {
      connection.release();
    }
  },

  /**
   * Retrieve all user emails.
   *
   * @async
   * @returns {Promise<Array<Object>>} List of user email records.
   */
  async getAllEmails() {
    let conn;

    const query = `
        SELECT email FROM User;
    `;

    try {
      conn = await pool.getConnection();
      
      const allEmails = conn.query(query);
      return allEmails;
    } catch (error) {
      throw error;
    } finally {
      if (conn) conn.release();
    }
  },

  /**
   * Update a user with the specified fields.
   *
   * @async
   * @param {number} userId - Identifier of the user to update.
   * @param {Object} fieldsToUpdate - Key-value pairs of fields to update.
   * @returns {Promise<Object>} Result of the update operation.
   */
  async updateUser(userId, fieldsToUpdate) {
    let conn;

    const setClauses = [];
    const values =[];

    for (const field in fieldsToUpdate) {
        setClauses.push(`${field} = ?`);
        values.push(fieldsToUpdate[field]);
      }

    values.push(userId);

    const query = `
        UPDATE User
        SET ${setClauses.join(', ')}
        WHERE user_id = ?
      `;
    try {
      conn = await pool.getConnection();
      const result = await conn.query(query, values);
      return result;
    } catch (error) {
      throw error;
    } finally {
      if (conn) conn.release();
    }
  },

  /**
   * Deactivate a user (soft delete).
   *
   * @async
   * @param {number} userId - User ID to deactivate.
   * @returns {Promise<boolean>} True if the operation affected at least one row.
   */
  async deactivateUserById(userId) {
    let conn;
    try {
      conn = await pool.getConnection();
      const result = await conn.query(
        `UPDATE User SET active = FALSE WHERE user_id = ?`,
        [userId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error deactivating user:', error);
      throw error;
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }

};

export default Admin;
