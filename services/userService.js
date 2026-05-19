/**
 * @module userService
 * @description Handles user authentication and user data retrieval,
 * including JWT generation and PII decryption.
 */
import userModel from "../models/userModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { decrypt } from "../middleware/decryption.js";

/**
 * Retrieves a user by ID, decrypting PII fields before returning.
 *
 * @param {number} userId - User ID
 * @returns {Promise<Object>} User data with decrypted email and phone number
 */
export async function getUserById(userId) {
  try {
    const userData = await userModel.getUserData(userId);

    const decryptedEmail = decrypt(userData.email);
    const decryptedPhone = decrypt(userData.phone_number);

    const user = {
      user_id: userData.user_id,
      user_name: userData.user_name,
      email: decryptedEmail,
      phone_number: decryptedPhone,
      workstation: userData.workstation,
      no_empleado: userData.no_empleado ?? null,
      department_name: userData.department_name,
      costs_center: userData.costs_center,
      creation_date: userData.creation_date,
      role_name: userData.role_name
    };
    return user;
  } catch (error) {
    throw new Error(`Error fetching user with ID ${userId}: ${error.message}`);
  }
}

/**
 * Authenticates a user by username and password, then generates a JWT
 * containing the user ID, role and client IP.
 *
 * @param {string} username - Username
 * @param {string} password - Plain-text password to verify
 * @param {Object} req - Express request object (used to embed client IP in the token)
 * @returns {Promise<Object>} Authenticated user data and signed JWT
 */
export async function authenticateUser(username, password, req) {
  try {
    const orgHint =
      req.body?.organization_id ?? req.body?.organizationId ?? undefined;
    const user = await userModel.getUserUsername(String(username).toLowerCase(), orgHint);

    if (!user) {
      throw new Error("Invalid username or password");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error("Invalid username or password");
    }

    if (!user.active) {
      throw new Error("User acccount is inactive");
    }

    // organization_id: del User. organization_kind: ROOT (Ditta) | CLIENT.
    // Bloquea login si la org está SUSPENDED (RNF-08 / multi-tenant).
    if (user.organization_status === "SUSPENDED") {
      throw new Error("Organización suspendida; contacta a tu administrador.");
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        organization_id: user.organization_id != null ? String(user.organization_id) : null,
        organization_kind: user.organization_kind || "CLIENT",
        role: user.role_name,
        no_empleado: user.no_empleado ?? null,
        ip: req.ip,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return {
      token,
      role: user.role_name,
      username: user.user_name,
      user_id: user.user_id,
      organization_id: user.organization_id != null ? String(user.organization_id) : null,
      organization_kind: user.organization_kind || "CLIENT",
      department_id: user.department_id,
      no_empleado: user.no_empleado ?? null,
      empleado_ceco: user.empleado_ceco ?? null,
      empleado_proveedor: user.empleado_proveedor ?? null,
      empleado_jefe_inmediato: user.empleado_jefe_inmediato ?? null,
    };
  } catch (error) {
    if (error?.code === "AMBIGUOUS_USERNAME") throw error;
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

export default {
  getUserById
};
