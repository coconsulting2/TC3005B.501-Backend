/**
 * @module userController
 * @description Handles HTTP requests for user authentication, profile data, and travel request queries.
 */
import * as userService from "../services/userService.js";
import User from "../models/userModel.js";
import { decrypt } from "../middleware/decryption.js";

/**
 * Retrieves user profile data by ID.
 * @param {import('express').Request} req - Express request (params: user_id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with user data or 400/404/500 error
 */
export async function getUserData(req, res) {
  try {
    const userId = parseInt(req.params.user_id);

    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const userData = await userService.getUserById(userId);

    if (!userData) {
      return res.status(404).json({ error: "No information found for the user" });
    }

    return res.status(200).json(userData);
  } catch (error) {
    console.error("Error retrieving user data", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Authenticates a user and sets session cookies (token, role, username, id, department_id).
 * @param {import('express').Request} req - Express request (body: { username, password })
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with auth result and cookies, or 401 error
 */
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await userService.authenticateUser(username, password, req);
    res
      .cookie("token", result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        maxAge: 1000 * 60 * 60, // 1 hour
      })
      .cookie("role", result.role, {
        sameSite: "Strict",
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24,
      })
      .cookie("username", result.username, {
        sameSite: "Strict",
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60,
      })
      .cookie("id", result.user_id.toString(), {
        sameSite: "Strict",
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60,
      })
      .cookie("department_id", result.department_id.toString(), {
        sameSite: "Strict",
        httpOnly: true,
        secure: true,
        maxAge: 1000 * 60 * 60,
      })
      .json(result);
  } catch (error) {
    res.status(401).json({ error: "Invalid credentials" });
  }
};

/**
 * Lists travel requests filtered by department and status.
 * @param {import('express').Request} req - Express request (params: dept_id, status_id, n?)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON array of formatted travel requests
 */
export const getTravelRequestsByDeptStatus = async (req, res) => {
  const deptId = Number(req.params.dept_id);
  const statusId = Number(req.params.status_id);
  const n = req.params.n ? Number(req.params.n) : null;

  try {
    const travelRequests = await User.getTravelRequestsByDeptStatus(deptId, statusId, n);

    if (!travelRequests || travelRequests.length === 0) {
      return res.status(404).json({ error: "No travel requests found" });
    }

    const formatted = travelRequests.map((r) => ({
      request_id: r.request_id,
      user_id: r.user_id,
      destination_country: r.destination_country,
      beginning_date: formatDate(r.beginning_date),
      ending_date: formatDate(r.ending_date),
      request_status: r.request_status,
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error("Error in getTravelRequestsByDeptStatus controller:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves a single travel request with full details (user info, routes).
 * Decrypts sensitive fields (email, phone) before responding.
 * @param {import('express').Request} req - Express request (params: request_id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with request details, user info, and routes array
 */
export const getTravelRequestById = async (req, res) => {
  const { request_id } = req.params;

  try {
    const requestData = await User.getTravelRequestById(request_id);

    if (!requestData || requestData.length === 0) {
      return res.status(404).json({ error: "Travel request not found" });
    }

    const base = requestData[0];
    const decryptedEmail = decrypt(base.user_email);
    const decryptedPhone = decrypt(base.user_phone_number);

    const response = {
      request_id: base.request_id,
      request_status: base.request_status,
      notes: base.notes,
      requested_fee: base.requested_fee,
      imposed_fee: base.imposed_fee,
      request_days: base.request_days,
      creation_date: formatDate(base.creation_date),
      user: {
        user_name: base.user_name,
        user_email: decryptedEmail,
        user_phone_number: decryptedPhone
      },
      routes: requestData.map((row) => ({
        router_index: row.router_index,
        origin_country: row.origin_country,
        origin_city: row.origin_city,
        destination_country: row.destination_country,
        destination_city: row.destination_city,
        beginning_date: formatDate(row.beginning_date),
        beginning_time: row.beginning_time,
        ending_date: formatDate(row.ending_date),
        ending_time: row.ending_time,
        hotel_needed: row.hotel_needed,
        plane_needed: row.plane_needed
      }))
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error in getTravelRequestById controller:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Retrieves user wallet balance.
 * @param {import('express').Request} req - Express request (params: user_id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with { user_id, user_name, wallet } or 404/500 error
 */
export const getUserWallet = async (req, res) => {
  const { user_id } = req.params;

  try {
    const user = await User.getUserWallet(user_id);

    if (!user) {
      return res.status(404).json({ error: `No user with id ${user_id} found` });
    }

    const formatted = {
      user_id: user.user_id,
      user_name: user.user_name,
      wallet: user.wallet,
    };

    return res.status(200).json(formatted);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Formats a date to ISO string (YYYY-MM-DD).
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
const formatDate = (date) => {
  return new Date(date).toISOString().split("T")[0];
};

/**
 * Logs out the user by clearing all session cookies.
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with logout confirmation message
 */
export const logout = (req, res) => {
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  };

  res
    .clearCookie("token", cookieOptions)
    .clearCookie("role", cookieOptions)
    .clearCookie("username", cookieOptions)
    .clearCookie("id", cookieOptions)
    .clearCookie("department_id", cookieOptions)
    .status(200)
    .json({ message: "Sesión cerrada correctamente" });
};
