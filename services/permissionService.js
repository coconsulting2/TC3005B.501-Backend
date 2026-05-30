/**
 * @module permissionService
 * @description Business logic for the granular permission system.
 * Effective-permission resolution is the read hot path (called by
 * permissionMiddleware.loadPermissions on every authenticated request).
 */
import {
  TENANT_APPLICANT_CAPABILITY_CODES,
  shouldMergeTenantApplicantCapability,
} from "../config/tenantApplicantCapability.js";
import { getTenantContext } from "../middleware/tenantContext.js";
import prisma from "../database/config/prisma.js";
import { ensureApplicantGroupsForRole } from "../prisma/seedHelpers/applicantRoleGroups.js";
import * as permissionModel from "../models/permissionModel.js";

const ADMIN_MANAGE_ROLE_CODE = "role:manage_permissions";

/**
 * @param {Set<string>} codes
 * @param {{ userActive: boolean, organizationKind?: string|null, organizationId?: bigint|number|string|null }} ctx
 */
function mergeTenantApplicantCapabilityCodes(codes, { userActive, organizationKind, organizationId }) {
  if (!shouldMergeTenantApplicantCapability({ userActive, organizationKind, organizationId })) return;
  for (const c of TENANT_APPLICANT_CAPABILITY_CODES) {
    codes.add(c);
  }
}

/**
 * Computes the effective permission codes for a user by unioning:
 *   role.rolePermissions
 *   ∪ role.rolePermissionGroups[*].items
 *   ∪ user.userPermissions
 *   ∪ user.userPermissionGroups[*].items
 *   ∪ tenant applicant capability (CocoAPI_flujos §7.5) when user is active and org allows it
 *
 * Inactive permissions are filtered out. Missing user yields an empty array.
 * Inactive users yield an empty array. Missing role does not block tenant applicant merge.
 *
 * @param {number} userId - Target user id
 * @returns {Promise<string[]>} Array of permission codes (deduped)
 */
export async function loadEffectivePermissions(userId) {
  const user = await permissionModel.findUserWithPermissions(userId);
  if (!user) return [];
  if (!user.active) return [];

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

  mergeTenantApplicantCapabilityCodes(codes, {
    userActive: user.active,
    organizationKind: user.organization?.kind ?? null,
    organizationId: user.organizationId,
  });

  return Array.from(codes);
}

/**
 * Permisos efectivos que tendría un usuario solo por su rol (sin grants directos al usuario),
 * más la capacidad solicitante implícita del tenant (misma unión que en `loadEffectivePermissions`).
 * Útil para vista previa de importación / onboarding.
 *
 * @param {number} roleId - Rol
 * @returns {Promise<string[]>} Códigos de permiso activos, ordenados
 */
export async function loadEffectivePermissionsForRole(roleId) {
  const role = await permissionModel.findRoleWithPermissions(roleId);
  if (!role) return [];

  const codes = new Set();

  const addPerm = (p) => {
    if (p && p.active) codes.add(p.code);
  };

  for (const rp of role.rolePermissions || []) {
    addPerm(rp.permission);
  }
  for (const rpg of role.rolePermissionGroups || []) {
    if (!rpg.group || !rpg.group.active) continue;
    for (const item of rpg.group.items || []) {
      addPerm(item.permission);
    }
  }

  mergeTenantApplicantCapabilityCodes(codes, {
    userActive: true,
    organizationKind: role.organization?.kind ?? null,
    organizationId: role.organizationId,
  });

  return Array.from(codes).sort((a, b) => a.localeCompare(b));
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

const ROLE_ADMIN_INCLUDE = {
  _count: { select: { users: { where: { active: true } } } },
  rolePermissions: { include: { permission: true } },
  rolePermissionGroups: {
    include: {
      group: { include: { items: { include: { permission: true } } } },
    },
  },
};

/**
 * @param {import("@prisma/client").Role & {
 *   rolePermissions?: Array<{ permission: { code: string, active: boolean } }>,
 *   rolePermissionGroups?: Array<{ group: { active: boolean, items: Array<{ permission: { code: string, active: boolean } }> } }>,
 *   _count?: { users: number },
 * }} role
 * @returns {string[]}
 */
function collectStoredPermissionCodes(role) {
  const set = new Set();
  const add = (p) => {
    if (p && p.active) set.add(p.code);
  };
  for (const rp of role.rolePermissions || []) add(rp.permission);
  for (const rpg of role.rolePermissionGroups || []) {
    if (!rpg.group?.active) continue;
    for (const item of rpg.group.items || []) add(item.permission);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * @param {Parameters<typeof collectStoredPermissionCodes>[0]} role
 * @returns {object}
 */
function serializeRoleRow(role) {
  const permissions = collectStoredPermissionCodes(role);
  return {
    role_id: role.roleId,
    name: role.roleName,
    permissions,
    max_authorization_amount: role.maxApprovalAmount ?? null,
    expiration_date: null,
    is_admin: permissions.includes(ADMIN_MANAGE_ROLE_CODE),
    active_users_count: role._count?.users ?? 0,
    is_system: Boolean(role.isSystem),
  };
}

/**
 *
 */
function assertTenantResolved() {
  const ctx = getTenantContext();
  if (!ctx?.organizationId) {
    const err = new Error("Se requiere contexto de organización (tenant)");
    err.status = 400;
    throw err;
  }
  return ctx;
}

/**
 * Lista roles del tenant con permisos almacenados (directos + grupos), sin unión de capacidad solicitante.
 *
 * @returns {Promise<object[]>}
 */
export async function listTenantRolesForAdmin() {
  assertTenantResolved();
  const rows = await permissionModel.listRolesWithAssignments();
  return rows.map(serializeRoleRow);
}

/**
 * Crea un rol personalizado (`isSystem: false`) con permisos directos y grupos solicitante por defecto.
 *
 * @param {object} payload
 * @param {string} [payload.name]
 * @param {string} [payload.roleName]
 * @param {string[]} [payload.permissions]
 * @param {number|string|null} [payload.max_authorization_amount]
 * @param {boolean} [payload.is_admin]
 * @returns {Promise<object>}
 */
export async function createTenantRole(payload) {
  const ctx = assertTenantResolved();
  const orgId = ctx.organizationId;
  const roleName = String(payload.name ?? payload.roleName ?? "").trim();
  if (roleName.length < 2 || roleName.length > 40) {
    const err = new Error("El nombre del rol debe tener entre 2 y 40 caracteres");
    err.status = 400;
    throw err;
  }

  const codes = [...(payload.permissions || [])].map((c) => String(c).trim()).filter(Boolean);
  if (payload.is_admin && !codes.includes(ADMIN_MANAGE_ROLE_CODE)) {
    codes.push(ADMIN_MANAGE_ROLE_CODE);
  }

  const maxVal = payload.max_authorization_amount;
  let maxApprovalAmount = null;
  if (maxVal !== "" && maxVal != null && maxVal !== undefined) {
    const n = Number(maxVal);
    if (!Number.isFinite(n) || n < 0) {
      const err = new Error("Monto máximo de autorización no válido");
      err.status = 400;
      throw err;
    }
    maxApprovalAmount = n;
  }

  try {
    const fullRole = await prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          roleName,
          maxApprovalAmount,
          isSystem: false,
        },
      });
      await ensureApplicantGroupsForRole(tx, orgId, created.roleId);
      if (codes.length > 0) {
        const resolved = await tx.permission.findMany({
          where: { code: { in: codes }, active: true },
          select: { permissionId: true },
        });
        const ids = resolved.map((p) => p.permissionId);
        if (ids.length > 0) {
          await tx.rolePermission.createMany({
            data: ids.map((permissionId) => ({ roleId: created.roleId, permissionId })),
            skipDuplicates: true,
          });
        }
      }
      return tx.role.findUniqueOrThrow({
        where: { roleId: created.roleId },
        include: ROLE_ADMIN_INCLUDE,
      });
    });
    return serializeRoleRow(fullRole);
  } catch (err) {
    if (err && err.code === "P2002") {
      const e = new Error("Ya existe un rol con ese nombre en la organización");
      e.status = 409;
      throw e;
    }
    throw err;
  }
}

/**
 * Actualiza un rol. Los roles de sistema solo permiten `max_authorization_amount`.
 * Los roles personalizados permiten nombre, monto y, si se envía `permissions`, reemplazo completo de permisos directos y re-enlace de grupos solicitante.
 *
 * @param {number} roleId
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateTenantRole(roleId, payload) {
  const ctx = assertTenantResolved();
  const role = await permissionModel.findRoleWithPermissions(Number(roleId));
  if (!role) {
    const err = new Error("Rol no encontrado");
    err.status = 404;
    throw err;
  }
  if (BigInt(role.organizationId) !== ctx.organizationId) {
    const err = new Error("Rol no encontrado");
    err.status = 404;
    throw err;
  }

  const rid = Number(roleId);
  const maxIn = payload.max_authorization_amount;
  let maxApprovalAmount = role.maxApprovalAmount;
  if (maxIn !== undefined) {
    if (maxIn === "" || maxIn === null) maxApprovalAmount = null;
    else {
      const n = Number(maxIn);
      if (!Number.isFinite(n) || n < 0) {
        const err = new Error("Monto máximo de autorización no válido");
        err.status = 400;
        throw err;
      }
      maxApprovalAmount = n;
    }
  }

  if (role.isSystem) {
    if (payload.name != null && String(payload.name).trim() !== role.roleName) {
      const err = new Error("No se puede renombrar un rol de sistema");
      err.status = 400;
      throw err;
    }
    if (payload.permissions != null || payload.is_admin != null) {
      const err = new Error(
        "Los roles de sistema solo permiten editar el monto máximo de autorización; los permisos vienen de grupos predefinidos.",
      );
      err.status = 400;
      throw err;
    }
    const updated = await prisma.role.update({
      where: { roleId: rid },
      data: { maxApprovalAmount },
      include: ROLE_ADMIN_INCLUDE,
    });
    return serializeRoleRow(updated);
  }

  let roleName = role.roleName;
  if (payload.name != null) {
    const next = String(payload.name).trim();
    if (next.length < 2 || next.length > 40) {
      const err = new Error("El nombre del rol debe tener entre 2 y 40 caracteres");
      err.status = 400;
      throw err;
    }
    roleName = next;
  }

  if (payload.permissions === undefined) {
    try {
      const updated = await prisma.role.update({
        where: { roleId: rid },
        data: { roleName, maxApprovalAmount },
        include: ROLE_ADMIN_INCLUDE,
      });
      return serializeRoleRow(updated);
    } catch (err) {
      if (err && err.code === "P2002") {
        const e = new Error("Ya existe un rol con ese nombre en la organización");
        e.status = 409;
        throw e;
      }
      throw err;
    }
  }

  let codes = [...payload.permissions].map((c) => String(c).trim()).filter(Boolean);
  if (payload.is_admin != null) {
    if (payload.is_admin && !codes.includes(ADMIN_MANAGE_ROLE_CODE)) {
      codes.push(ADMIN_MANAGE_ROLE_CODE);
    }
    if (!payload.is_admin) {
      codes = codes.filter((c) => c !== ADMIN_MANAGE_ROLE_CODE);
    }
  }

  const orgId = ctx.organizationId;

  try {
    const updatedRow = await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: rid } });
      await tx.rolePermissionGroup.deleteMany({ where: { roleId: rid } });
      await tx.role.update({
        where: { roleId: rid },
        data: { roleName, maxApprovalAmount },
      });
      await ensureApplicantGroupsForRole(tx, orgId, rid);
      if (codes.length > 0) {
        const resolved = await tx.permission.findMany({
          where: { code: { in: codes }, active: true },
          select: { permissionId: true },
        });
        const ids = resolved.map((p) => p.permissionId);
        if (ids.length > 0) {
          await tx.rolePermission.createMany({
            data: ids.map((permissionId) => ({ roleId: rid, permissionId })),
            skipDuplicates: true,
          });
        }
      }
      return tx.role.findUniqueOrThrow({
        where: { roleId: rid },
        include: ROLE_ADMIN_INCLUDE,
      });
    });
    return serializeRoleRow(updatedRow);
  } catch (err) {
    if (err && err.code === "P2002") {
      const e = new Error("Ya existe un rol con ese nombre en la organización");
      e.status = 409;
      throw e;
    }
    throw err;
  }
}

/**
 * Elimina un rol personalizado sin usuarios activos.
 *
 * @param {number} roleId
 * @returns {Promise<void>}
 */
export async function deleteTenantRole(roleId) {
  const ctx = assertTenantResolved();
  const role = await permissionModel.findRoleWithPermissions(Number(roleId));
  if (!role) {
    const err = new Error("Rol no encontrado");
    err.status = 404;
    throw err;
  }
  if (BigInt(role.organizationId) !== ctx.organizationId) {
    const err = new Error("Rol no encontrado");
    err.status = 404;
    throw err;
  }
  if (role.isSystem) {
    const err = new Error("No se pueden eliminar roles de sistema");
    err.status = 400;
    throw err;
  }
  const n = await prisma.user.count({
    where: { roleId: Number(roleId), active: true },
  });
  if (n > 0) {
    const err = new Error("No se puede eliminar un rol con usuarios activos; reasígnalos antes.");
    err.status = 400;
    throw err;
  }
  await prisma.role.delete({ where: { roleId: Number(roleId) } });
}
