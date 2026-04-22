/**
 * @module permissionController
 * @description HTTP handlers for the granular permission system. Admin-facing
 * CRUD for permissions, groups, and role/user assignments. All routes that
 * reach these handlers have already passed requirePermission(...) for the
 * appropriate meta-permission (see routes/permissionRoutes.js).
 */
import * as permissionService from "../services/permissionService.js";

/**
 * Narrows a Prisma NotFoundError into a 404 response; rethrows anything else.
 *
 * @param {Error} err - Thrown error
 * @param {import("express").Response} res - Response to send if this is a 404
 * @returns {boolean} true if handled as 404; false otherwise
 */
const handleNotFound = (err, res) => {
  if (err && err.code === "P2025") {
    res.status(404).json({ error: "Resource not found" });
    return true;
  }
  return false;
};

// ─── Permission catalog ─────────────────────────────────────────────────────

/**
 * GET /api/admin/permissions
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON array of permissions
 */
export const listPermissions = async (req, res) => {
  try {
    const activeOnly = req.query.active_only === "true";
    const rows = await permissionService.getPermissions({ activeOnly });
    res.status(200).json(rows);
  } catch (err) {
    console.error("listPermissions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/admin/permissions
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} Created permission JSON or 409 on duplicate
 */
export const createPermission = async (req, res) => {
  try {
    const { code, resource, action, description } = req.body;
    const row = await permissionService.createPermission({ code, resource, action, description });
    res.status(201).json(row);
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ error: err.message });
    }
    console.error("createPermission error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /api/admin/permissions/:id
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} Updated permission JSON
 */
export const updatePermission = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await permissionService.updatePermission(id, req.body);
    res.status(200).json(row);
  } catch (err) {
    if (handleNotFound(err, res)) return;
    console.error("updatePermission error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /api/admin/permissions/:id (soft delete).
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} Deactivated permission JSON
 */
export const deactivatePermission = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await permissionService.deactivatePermission(id);
    res.status(200).json(row);
  } catch (err) {
    if (handleNotFound(err, res)) return;
    console.error("deactivatePermission error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Permission groups ──────────────────────────────────────────────────────

/**
 * GET /api/admin/permission-groups
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} Array of groups with items
 */
export const listPermissionGroups = async (req, res) => {
  try {
    const rows = await permissionService.getPermissionGroups();
    res.status(200).json(rows);
  } catch (err) {
    console.error("listPermissionGroups error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/admin/permission-groups/:id
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} Group JSON or 404
 */
export const getPermissionGroup = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await permissionService.getPermissionGroup(id);
    if (!row) return res.status(404).json({ error: "Group not found" });
    res.status(200).json(row);
  } catch (err) {
    console.error("getPermissionGroup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/admin/permission-groups
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} Created group JSON
 */
export const createPermissionGroup = async (req, res) => {
  try {
    const { groupName, description } = req.body;
    const row = await permissionService.createPermissionGroup({ groupName, description });
    res.status(201).json(row);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Group name already exists" });
    }
    console.error("createPermissionGroup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /api/admin/permission-groups/:id
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} Updated group JSON
 */
export const updatePermissionGroup = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await permissionService.updatePermissionGroup(id, req.body);
    res.status(200).json(row);
  } catch (err) {
    if (handleNotFound(err, res)) return;
    console.error("updatePermissionGroup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /api/admin/permission-groups/:id (soft delete).
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} Deactivated group JSON
 */
export const deactivatePermissionGroup = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await permissionService.deactivatePermissionGroup(id);
    res.status(200).json(row);
  } catch (err) {
    if (handleNotFound(err, res)) return;
    console.error("deactivatePermissionGroup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/admin/permission-groups/:id/permissions
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} createMany result
 */
export const addPermissionsToGroup = async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { permissionIds } = req.body;
    const result = await permissionService.addPermissionsToGroup(groupId, permissionIds);
    res.status(200).json(result);
  } catch (err) {
    console.error("addPermissionsToGroup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /api/admin/permission-groups/:id/permissions/:permissionId
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} 204 on success
 */
export const removePermissionFromGroup = async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const permissionId = Number(req.params.permissionId);
    await permissionService.removePermissionFromGroup(groupId, permissionId);
    res.status(204).end();
  } catch (err) {
    if (handleNotFound(err, res)) return;
    console.error("removePermissionFromGroup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Role assignments ───────────────────────────────────────────────────────

/**
 * POST /api/admin/roles/:roleId/permissions
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} createMany result
 */
export const addPermissionsToRole = async (req, res) => {
  try {
    const roleId = Number(req.params.roleId);
    const { permissionIds } = req.body;
    const result = await permissionService.addPermissionsToRole(roleId, permissionIds);
    res.status(200).json(result);
  } catch (err) {
    console.error("addPermissionsToRole error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /api/admin/roles/:roleId/permissions/:permissionId
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} 204 on success
 */
export const removePermissionFromRole = async (req, res) => {
  try {
    const roleId = Number(req.params.roleId);
    const permissionId = Number(req.params.permissionId);
    await permissionService.removePermissionFromRole(roleId, permissionId);
    res.status(204).end();
  } catch (err) {
    if (handleNotFound(err, res)) return;
    console.error("removePermissionFromRole error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/admin/roles/:roleId/permission-groups
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} createMany result
 */
export const addGroupsToRole = async (req, res) => {
  try {
    const roleId = Number(req.params.roleId);
    const { groupIds } = req.body;
    const result = await permissionService.addGroupsToRole(roleId, groupIds);
    res.status(200).json(result);
  } catch (err) {
    console.error("addGroupsToRole error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /api/admin/roles/:roleId/permission-groups/:groupId
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} 204 on success
 */
export const removeGroupFromRole = async (req, res) => {
  try {
    const roleId = Number(req.params.roleId);
    const groupId = Number(req.params.groupId);
    await permissionService.removeGroupFromRole(roleId, groupId);
    res.status(204).end();
  } catch (err) {
    if (handleNotFound(err, res)) return;
    console.error("removeGroupFromRole error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── User assignments ───────────────────────────────────────────────────────

/**
 * POST /api/admin/users/:userId/permissions
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} createMany result
 */
export const addPermissionsToUser = async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { permissionIds } = req.body;
    const result = await permissionService.addPermissionsToUser(userId, permissionIds);
    res.status(200).json(result);
  } catch (err) {
    console.error("addPermissionsToUser error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /api/admin/users/:userId/permissions/:permissionId
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} 204 on success
 */
export const removePermissionFromUser = async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const permissionId = Number(req.params.permissionId);
    await permissionService.removePermissionFromUser(userId, permissionId);
    res.status(204).end();
  } catch (err) {
    if (handleNotFound(err, res)) return;
    console.error("removePermissionFromUser error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/admin/users/:userId/permission-groups
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} createMany result
 */
export const addGroupsToUser = async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { groupIds } = req.body;
    const result = await permissionService.addGroupsToUser(userId, groupIds);
    res.status(200).json(result);
  } catch (err) {
    console.error("addGroupsToUser error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /api/admin/users/:userId/permission-groups/:groupId
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} 204 on success
 */
export const removeGroupFromUser = async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const groupId = Number(req.params.groupId);
    await permissionService.removeGroupFromUser(userId, groupId);
    res.status(204).end();
  } catch (err) {
    if (handleNotFound(err, res)) return;
    console.error("removeGroupFromUser error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/admin/users/:userId/effective-permissions
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} { userId, permissions: string[] }
 */
export const getUserEffectivePermissions = async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const report = await permissionService.getUserEffectivePermissions(userId);
    res.status(200).json(report);
  } catch (err) {
    console.error("getUserEffectivePermissions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
