/**
 * @module permissionService
 * @description Business logic for the granular permission system.
 * Effective-permission resolution is the read hot path (called by
 * permissionMiddleware.loadPermissions on every authenticated request).
 */
import * as permissionModel from "../models/permissionModel.js";

/**
 * Computes the effective permission codes for a user by unioning:
 *   role.rolePermissions
 *   ∪ role.rolePermissionGroups[*].items
 *   ∪ user.userPermissions
 *   ∪ user.userPermissionGroups[*].items
 *
 * Inactive permissions are filtered out. Missing user or missing role
 * yields an empty array — never throws for "no permissions".
 *
 * @param {number} userId - Target user id
 * @returns {Promise<string[]>} Array of permission codes (deduped)
 */
export async function loadEffectivePermissions(userId) {
  const user = await permissionModel.findUserWithPermissions(userId);
  if (!user) return [];

  const codes = new Set();

  const addPerm = (p) => {
    if (p && p.active) codes.add(p.code);
  };

  if (user.role) {
    for (const rp of user.role.rolePermissions || []) {
      addPerm(rp.permission);
    }
    for (const rpg of user.role.rolePermissionGroups || []) {
      if (!rpg.group || !rpg.group.active) continue;
      for (const item of rpg.group.items || []) {
        addPerm(item.permission);
      }
    }
  }

  for (const up of user.userPermissions || []) {
    addPerm(up.permission);
  }
  for (const upg of user.userPermissionGroups || []) {
    if (!upg.group || !upg.group.active) continue;
    for (const item of upg.group.items || []) {
      addPerm(item.permission);
    }
  }

  return Array.from(codes);
}

// ─── Permission catalog ─────────────────────────────────────────────────────

/**
 * Lists permissions.
 *
 * @param {Object} [opts] - { activeOnly?: boolean }
 * @returns {Promise<Array>} Permission rows
 */
export const getPermissions = (opts) => permissionModel.listPermissions(opts);

/**
 * Creates a permission. Enforces unique code.
 *
 * @param {Object} data - { code, resource, action, description? }
 * @param {string} data.code - Unique permission code in `resource:action` form
 * @param {string} data.resource - Resource name
 * @param {string} data.action - Action name
 * @param {string} [data.description] - Optional human-readable description
 * @returns {Promise<Object>} Created row
 * @throws {Error} If code already exists
 */
export async function createPermission({ code, resource, action, description }) {
  const existing = await permissionModel.findPermissionByCode(code);
  if (existing) {
    const err = new Error(`Permission with code "${code}" already exists`);
    err.status = 409;
    throw err;
  }
  return permissionModel.createPermission({ code, resource, action, description });
}

/**
 * Updates a permission.
 *
 * @param {number} permissionId - Target id
 * @param {Object} data - Partial update
 * @returns {Promise<Object>} Updated row
 */
export const updatePermission = (permissionId, data) =>
  permissionModel.updatePermission(permissionId, data);

/**
 * Soft-deletes a permission (sets active=false).
 *
 * @param {number} permissionId - Target id
 * @returns {Promise<Object>} Updated row
 */
export const deactivatePermission = (permissionId) =>
  permissionModel.deactivatePermission(permissionId);

// ─── Permission groups ──────────────────────────────────────────────────────

export const getPermissionGroups = () => permissionModel.listPermissionGroups();
export const getPermissionGroup = (id) => permissionModel.findPermissionGroup(id);

/**
 * Creates a permission group.
 *
 * @param {Object} data - { groupName, description? }
 * @returns {Promise<Object>} Created group
 */
export const createPermissionGroup = (data) => permissionModel.createPermissionGroup(data);

export const updatePermissionGroup = (id, data) =>
  permissionModel.updatePermissionGroup(id, data);

export const deactivatePermissionGroup = (id) =>
  permissionModel.deactivatePermissionGroup(id);

export const addPermissionsToGroup = (groupId, permissionIds) =>
  permissionModel.addPermissionsToGroup(groupId, permissionIds);

export const removePermissionFromGroup = (groupId, permissionId) =>
  permissionModel.removePermissionFromGroup(groupId, permissionId);

// ─── Role assignments ───────────────────────────────────────────────────────

export const addPermissionsToRole = (roleId, permissionIds) =>
  permissionModel.addPermissionsToRole(roleId, permissionIds);

export const removePermissionFromRole = (roleId, permissionId) =>
  permissionModel.removePermissionFromRole(roleId, permissionId);

export const addGroupsToRole = (roleId, groupIds) =>
  permissionModel.addGroupsToRole(roleId, groupIds);

export const removeGroupFromRole = (roleId, groupId) =>
  permissionModel.removeGroupFromRole(roleId, groupId);

// ─── User assignments ───────────────────────────────────────────────────────

export const addPermissionsToUser = (userId, permissionIds) =>
  permissionModel.addPermissionsToUser(userId, permissionIds);

export const removePermissionFromUser = (userId, permissionId) =>
  permissionModel.removePermissionFromUser(userId, permissionId);

export const addGroupsToUser = (userId, groupIds) =>
  permissionModel.addGroupsToUser(userId, groupIds);

export const removeGroupFromUser = (userId, groupId) =>
  permissionModel.removeGroupFromUser(userId, groupId);

/**
 * Returns the effective permission codes for a user (admin inspection).
 *
 * @param {number} userId - Target user id
 * @returns {Promise<{ userId: number, permissions: string[] }>} Report
 */
export async function getUserEffectivePermissions(userId) {
  const permissions = await loadEffectivePermissions(userId);
  return { userId, permissions };
}
