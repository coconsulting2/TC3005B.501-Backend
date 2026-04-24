/**
 * @module permissionModel
 * @description Data-access layer for the granular permission system.
 * All Prisma queries live here so services stay free of ORM specifics.
 */
import prisma from "../database/config/prisma.js";

/**
 * Fetches a user with all their role permissions, role groups (and their items),
 * direct user permissions, and direct user groups (and their items). Used by
 * the permission service to compute the effective permission set.
 *
 * @param {number} userId - Target user id
 * @returns {Promise<Object|null>} Nested user record or null
 */
export const findUserWithPermissions = (userId) =>
  prisma.user.findUnique({
    where: { userId },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
          rolePermissionGroups: {
            include: {
              group: {
                include: {
                  items: { include: { permission: true } },
                },
              },
            },
          },
        },
      },
      userPermissions: {
        include: { permission: true },
      },
      userPermissionGroups: {
        include: {
          group: {
            include: {
              items: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

/**
 * Lists permissions, optionally filtered by active flag.
 *
 * @param {Object} [options] - Filters
 * @param {boolean} [options.activeOnly=false] - If true, returns only active permissions
 * @returns {Promise<Array>} Array of Permission rows
 */
export const listPermissions = ({ activeOnly = false } = {}) =>
  prisma.permission.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ resource: "asc" }, { action: "asc" }],
  });

/**
 * Finds a permission by its unique code.
 *
 * @param {string} code - Permission code (e.g. "travel_request:approve")
 * @returns {Promise<Object|null>} Permission row or null
 */
export const findPermissionByCode = (code) =>
  prisma.permission.findUnique({ where: { code } });

/**
 * Creates a new permission entry.
 *
 * @param {Object} data - { code, resource, action, description? }
 * @returns {Promise<Object>} Created Permission row
 */
export const createPermission = (data) =>
  prisma.permission.create({ data });

/**
 * Updates an existing permission.
 *
 * @param {number} permissionId - Target permission id
 * @param {Object} data - Partial update
 * @returns {Promise<Object>} Updated Permission row
 */
export const updatePermission = (permissionId, data) =>
  prisma.permission.update({ where: { permissionId }, data });

/**
 * Soft-deletes a permission by setting active=false.
 *
 * @param {number} permissionId - Target permission id
 * @returns {Promise<Object>} Updated Permission row
 */
export const deactivatePermission = (permissionId) =>
  prisma.permission.update({ where: { permissionId }, data: { active: false } });

/**
 * Lists permission groups, including their member permissions.
 *
 * @returns {Promise<Array>} Array of PermissionGroup rows with items
 */
export const listPermissionGroups = () =>
  prisma.permissionGroup.findMany({
    orderBy: { groupName: "asc" },
    include: { items: { include: { permission: true } } },
  });

/**
 * Finds a permission group by id, including its members.
 *
 * @param {number} groupId - Target group id
 * @returns {Promise<Object|null>} Group row with items or null
 */
export const findPermissionGroup = (groupId) =>
  prisma.permissionGroup.findUnique({
    where: { groupId },
    include: { items: { include: { permission: true } } },
  });

/**
 * Creates a permission group.
 *
 * @param {Object} data - { groupName, description? }
 * @returns {Promise<Object>} Created group
 */
export const createPermissionGroup = (data) =>
  prisma.permissionGroup.create({ data });

/**
 * Updates a permission group.
 *
 * @param {number} groupId - Target group id
 * @param {Object} data - Partial update
 * @returns {Promise<Object>} Updated group
 */
export const updatePermissionGroup = (groupId, data) =>
  prisma.permissionGroup.update({ where: { groupId }, data });

/**
 * Soft-deletes a group.
 *
 * @param {number} groupId - Target group id
 * @returns {Promise<Object>} Updated group
 */
export const deactivatePermissionGroup = (groupId) =>
  prisma.permissionGroup.update({ where: { groupId }, data: { active: false } });

/**
 * Adds permissions to a group (idempotent via skipDuplicates).
 *
 * @param {number} groupId - Target group id
 * @param {number[]} permissionIds - Ids of permissions to add
 * @returns {Promise<Object>} createMany result
 */
export const addPermissionsToGroup = (groupId, permissionIds) =>
  prisma.permissionGroupItem.createMany({
    data: permissionIds.map((permissionId) => ({ groupId, permissionId })),
    skipDuplicates: true,
  });

/**
 * Removes a permission from a group.
 *
 * @param {number} groupId - Target group id
 * @param {number} permissionId - Permission id to remove
 * @returns {Promise<Object>} Deleted item
 */
export const removePermissionFromGroup = (groupId, permissionId) =>
  prisma.permissionGroupItem.delete({
    where: { groupId_permissionId: { groupId, permissionId } },
  });

/**
 * Adds permissions to a role.
 *
 * @param {number} roleId - Target role id
 * @param {number[]} permissionIds - Ids of permissions to add
 * @returns {Promise<Object>} createMany result
 */
export const addPermissionsToRole = (roleId, permissionIds) =>
  prisma.rolePermission.createMany({
    data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    skipDuplicates: true,
  });

/**
 * Removes a permission from a role.
 *
 * @param {number} roleId - Target role id
 * @param {number} permissionId - Permission id to remove
 * @returns {Promise<Object>} Deleted row
 */
export const removePermissionFromRole = (roleId, permissionId) =>
  prisma.rolePermission.delete({
    where: { roleId_permissionId: { roleId, permissionId } },
  });

/**
 * Adds permission groups to a role.
 *
 * @param {number} roleId - Target role id
 * @param {number[]} groupIds - Ids of groups to add
 * @returns {Promise<Object>} createMany result
 */
export const addGroupsToRole = (roleId, groupIds) =>
  prisma.rolePermissionGroup.createMany({
    data: groupIds.map((groupId) => ({ roleId, groupId })),
    skipDuplicates: true,
  });

/**
 * Removes a permission group from a role.
 *
 * @param {number} roleId - Target role id
 * @param {number} groupId - Group id to remove
 * @returns {Promise<Object>} Deleted row
 */
export const removeGroupFromRole = (roleId, groupId) =>
  prisma.rolePermissionGroup.delete({
    where: { roleId_groupId: { roleId, groupId } },
  });

/**
 * Adds permissions directly to a user (additive over role-derived set).
 *
 * @param {number} userId - Target user id
 * @param {number[]} permissionIds - Ids of permissions to add
 * @returns {Promise<Object>} createMany result
 */
export const addPermissionsToUser = (userId, permissionIds) =>
  prisma.userPermission.createMany({
    data: permissionIds.map((permissionId) => ({ userId, permissionId })),
    skipDuplicates: true,
  });

/**
 * Removes a direct permission grant from a user.
 *
 * @param {number} userId - Target user id
 * @param {number} permissionId - Permission id
 * @returns {Promise<Object>} Deleted row
 */
export const removePermissionFromUser = (userId, permissionId) =>
  prisma.userPermission.delete({
    where: { userId_permissionId: { userId, permissionId } },
  });

/**
 * Adds permission groups directly to a user (additive).
 *
 * @param {number} userId - Target user id
 * @param {number[]} groupIds - Group ids
 * @returns {Promise<Object>} createMany result
 */
export const addGroupsToUser = (userId, groupIds) =>
  prisma.userPermissionGroup.createMany({
    data: groupIds.map((groupId) => ({ userId, groupId })),
    skipDuplicates: true,
  });

/**
 * Removes a permission group directly assigned to a user.
 *
 * @param {number} userId - Target user id
 * @param {number} groupId - Group id
 * @returns {Promise<Object>} Deleted row
 */
export const removeGroupFromUser = (userId, groupId) =>
  prisma.userPermissionGroup.delete({
    where: { userId_groupId: { userId, groupId } },
  });
