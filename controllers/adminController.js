/**
 * @module adminController
 * @description Handles HTTP requests for admin user management (CRUD, CSV import, deactivation).
 */
import parseCSV from "../services/adminService.js";
import * as adminService from "../services/adminService.js";
import Admin from "../models/adminModel.js";
import userModel from "../models/userModel.js";

/**
 * Retrieves the list of all active users with their roles and departments.
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON array of user objects or 404/500 error
 */
export const getUserList = async (req, res) => {
    try {
        const users = await adminService.getUserList();
        if (!users) {
            return res.status(404).json({ error: "No users found" });
        }
        const formattedUsers = users.map(user => ({
            user_id: user.user_id,
            user_name: user.user_name,
            email: user.email,
            role_name: user.role_name,
            department_name: user.department_name,
            phone_number: user.phone_number,
        }));
        res.status(200).json(formattedUsers);
    } catch (error) {
        console.error("Error getting user list:", error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Creates multiple users from an uploaded CSV file.
 * @param {import('express').Request} req - Express request (file: CSV via multer)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with CSV parsing result or 400/500 error
 */
export const createMultipleUsers = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No CSV file uploaded" });
    }

    const filePath = req.file.path;

    try {
        const result = await adminService.parseCSV(filePath, false);
        res.status(200).json(result);
    } catch (error) {
        console.error("Error in createMultipleUsers:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Creates a single new user.
 * @param {import('express').Request} req - Express request (body: user data)
 * @param {import('express').Response} res - Express response
 * @returns {void} 201 JSON with success message or 500 error
 */
export const createUser = async (req, res) => {
    try {
        const userData = req.body;
        await adminService.createUser(userData);
        return res.status(201).json({ message: "User created succesfully" });
    } catch (error) {
        console.error("Error creating user:", error.status);
        return res.status(error.status || 500).json({ error: error.message || "Internal server error" });
    }
};

/**
 * Updates an existing user's data. Propagates service-level status codes.
 * @param {import('express').Request} req - Express request (params: user_id, body: fields to update)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with update result or error
 */
export const updateUser = async (req, res) => {
    try {
        const userId = req.params.user_id;
        const result = await adminService.updateUserData(userId, req.body);
        return res.status(200).json(result);
    } catch (error) {
        console.error("An error occurred updating the user:", error);
        return res.status(error.status || 500).json({ error: "Internal server error" });
    }
};

/**
 * Deactivates a user account (soft delete).
 * @param {import('express').Request} req - Express request (params: user_id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with deactivation confirmation or 404/500 error
 */
export const deactivateUser = async (req, res) => {
    try {
        const userId = parseInt(req.params.user_id);

        const user = await userModel.getUserData(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        await Admin.deactivateUserById(userId);

        return res.status(200).json({
            message: "User successfully deactivated",
            user_id: userId,
            active: false
        });
    } catch (error) {
        console.error("Error in deactivateUser:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export default {
    getUserList,
    deactivateUser,
    createMultipleUsers,
    createUser,
    updateUser
};
