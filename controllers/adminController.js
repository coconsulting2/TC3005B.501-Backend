/**
 * @module adminController
 * @description Handles HTTP requests for admin user management (CRUD, CSV import, deactivation).
 */
import * as adminService from "../services/adminService.js";
import Admin from "../models/adminModel.js";
import userModel from "../models/userModel.js";
import employeeSyncService from "../services/employeeSyncService.js";
import EmployeeModel from "../models/employeeModel.js";

/**
 * Org activa (JWT o tenant tras impersonación).
 * @param {import("express").Request} req
 * @returns {bigint|number|string|null}
 */
const resolveActiveOrganizationId = (req) =>
    req.tenant?.organizationId ?? req.user?.organization_id ?? null;

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
            organization_id: user.organization_id,
            organization_name: user.organization_name,
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

/**
 * Sincroniza una transacción de empleado desde RH/SAP.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const syncEmployee = async (req, res) => {
    try {
        const organizationId = resolveActiveOrganizationId(req);
        if (organizationId == null) {
            return res.status(401).json({
                status: "error",
                errores: ["organization_id no disponible en contexto (token o impersonación)"],
            });
        }
        const result = await employeeSyncService.syncEmployee(organizationId, req.body, req.user);
        return res.status(200).json(result);
    } catch (error) {
        const code = Number(error?.status) || 500;
        return res.status(code).json({
            idTransaction: req.body?.header?.idTransaction ?? null,
            status: "error",
            noEmpleado: req.body?.detalle?.noEmpleado ?? null,
            accion_realizada: null,
            errores: [error?.message || "Internal server error"],
        });
    }
};

/**
 * Lista empleados del tenant actual.
 * Query opcional: ?status=A|I
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const getEmployees = async (req, res) => {
    try {
        const organizationId = resolveActiveOrganizationId(req);
        if (organizationId == null) {
            return res.status(401).json({
                error: "organization_id no disponible en contexto (token o impersonación)",
            });
        }
        const status = req.query?.status ? String(req.query.status).toUpperCase() : null;
        const rows = await EmployeeModel.listByOrganization(organizationId, { status });
        return res.status(200).json({
            employees: rows.map((e) => ({
                no_empleado: e.noEmpleado,
                nombre: e.nombre,
                email: e.email,
                jefe_inmediato: e.jefeInmediato,
                proveedor: e.proveedor,
                ceco: e.ceco,
                status: e.status,
                fecha_alta: e.fechaAlta,
                fecha_ultima_modificacion: e.fechaUltimaModificacion,
                usuario_ultima_modificacion: e.usuarioUltimaModificacion,
            })),
        });
    } catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Vincula/desvincula un usuario con no_empleado.
 * Body: { no_empleado: string|null }
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const linkUserEmployee = async (req, res) => {
    try {
        const organizationId = resolveActiveOrganizationId(req);
        if (organizationId == null) {
            return res.status(401).json({
                error: "organization_id no disponible en contexto (token o impersonación)",
            });
        }
        const userId = Number(req.params.user_id);
        if (!Number.isFinite(userId) || userId < 1) {
            return res.status(400).json({ error: "user_id inválido" });
        }

        const user = await Admin.findUserByIdInOrg(userId, organizationId);
        if (!user) return res.status(404).json({ error: "User not found in organization" });

        const noEmpleado = req.body?.no_empleado ?? null;
        if (noEmpleado !== null) {
            const empleado = await EmployeeModel.findByNoEmpleado(organizationId, noEmpleado);
            if (!empleado) {
                return res.status(404).json({ error: `Empleado ${noEmpleado} no existe en la organización` });
            }
        }

        await Admin.updateUser(userId, { noEmpleado });
        return res.status(200).json({
            message: "User employee link updated",
            user_id: userId,
            no_empleado: noEmpleado,
        });
    } catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
};

export default {
    getUserList,
    deactivateUser,
    createMultipleUsers,
    createUser,
    updateUser,
    syncEmployee,
    getEmployees,
    linkUserEmployee,
};
