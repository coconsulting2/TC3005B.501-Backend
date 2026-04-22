/**
 * @file routes/permissionRoutes.js
 * @description Admin routes for the granular permission system. Mounted at
 * /api/admin/permissions* (and sibling /api/admin/roles/:roleId/... and
 * /api/admin/users/:userId/...) from app.js.
 *
 * Every route goes through requirePermission (or requireAnyPermission) which
 * always composes authenticateToken first — there is no path that reaches a
 * handler here without a valid JWT.
 */
import express from "express";
import { body, param } from "express-validator";
import * as permissionController from "../controllers/permissionController.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { validateInputs } from "../middleware/validation.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

// ─── Validators ─────────────────────────────────────────────────────────────

const validateIntParam = (name) => [
  param(name).isInt({ min: 1 }).toInt().withMessage(`${name} must be a positive integer`),
];

const validateCreatePermission = [
  body("code").isString().trim().isLength({ min: 3, max: 80 }).withMessage("code is required (3–80 chars)"),
  body("resource").isString().trim().isLength({ min: 1, max: 40 }).withMessage("resource is required (1–40 chars)"),
  body("action").isString().trim().isLength({ min: 1, max: 40 }).withMessage("action is required (1–40 chars)"),
  body("description").optional({ nullable: true }).isString().isLength({ max: 254 }),
];

const validateUpdatePermission = [
  body("resource").optional().isString().trim().isLength({ min: 1, max: 40 }),
  body("action").optional().isString().trim().isLength({ min: 1, max: 40 }),
  body("description").optional({ nullable: true }).isString().isLength({ max: 254 }),
  body("active").optional().isBoolean(),
];

const validateCreateGroup = [
  body("groupName").isString().trim().isLength({ min: 2, max: 60 }).withMessage("groupName is required (2–60 chars)"),
  body("description").optional({ nullable: true }).isString().isLength({ max: 254 }),
];

const validateUpdateGroup = [
  body("groupName").optional().isString().trim().isLength({ min: 2, max: 60 }),
  body("description").optional({ nullable: true }).isString().isLength({ max: 254 }),
  body("active").optional().isBoolean(),
];

const validatePermissionIds = [
  body("permissionIds").isArray({ min: 1 }).withMessage("permissionIds must be a non-empty array"),
  body("permissionIds.*").isInt({ min: 1 }).toInt().withMessage("each permissionId must be a positive integer"),
];

const validateGroupIds = [
  body("groupIds").isArray({ min: 1 }).withMessage("groupIds must be a non-empty array"),
  body("groupIds.*").isInt({ min: 1 }).toInt().withMessage("each groupId must be a positive integer"),
];

// ─── Permission catalog ─────────────────────────────────────────────────────

router.route("/permissions")
  .get(generalRateLimiter, ...requirePermission("permission:read"), permissionController.listPermissions)
  .post(generalRateLimiter, ...requirePermission("permission:write"),
    validateCreatePermission, validateInputs,
    permissionController.createPermission);

router.route("/permissions/:id")
  .patch(generalRateLimiter, ...requirePermission("permission:write"),
    validateIntParam("id"), validateUpdatePermission, validateInputs,
    permissionController.updatePermission)
  .delete(generalRateLimiter, ...requirePermission("permission:write"),
    validateIntParam("id"), validateInputs,
    permissionController.deactivatePermission);

// ─── Permission groups ──────────────────────────────────────────────────────

router.route("/permission-groups")
  .get(generalRateLimiter, ...requirePermission("permission:read"), permissionController.listPermissionGroups)
  .post(generalRateLimiter, ...requirePermission("permission_group:manage"),
    validateCreateGroup, validateInputs,
    permissionController.createPermissionGroup);

router.route("/permission-groups/:id")
  .get(generalRateLimiter, ...requirePermission("permission:read"),
    validateIntParam("id"), validateInputs,
    permissionController.getPermissionGroup)
  .patch(generalRateLimiter, ...requirePermission("permission_group:manage"),
    validateIntParam("id"), validateUpdateGroup, validateInputs,
    permissionController.updatePermissionGroup)
  .delete(generalRateLimiter, ...requirePermission("permission_group:manage"),
    validateIntParam("id"), validateInputs,
    permissionController.deactivatePermissionGroup);

router.route("/permission-groups/:id/permissions")
  .post(generalRateLimiter, ...requirePermission("permission_group:manage"),
    validateIntParam("id"), validatePermissionIds, validateInputs,
    permissionController.addPermissionsToGroup);

router.route("/permission-groups/:id/permissions/:permissionId")
  .delete(generalRateLimiter, ...requirePermission("permission_group:manage"),
    validateIntParam("id"), validateIntParam("permissionId"), validateInputs,
    permissionController.removePermissionFromGroup);

// ─── Role assignments ───────────────────────────────────────────────────────

router.route("/roles/:roleId/permissions")
  .post(generalRateLimiter, ...requirePermission("role:manage_permissions"),
    validateIntParam("roleId"), validatePermissionIds, validateInputs,
    permissionController.addPermissionsToRole);

router.route("/roles/:roleId/permissions/:permissionId")
  .delete(generalRateLimiter, ...requirePermission("role:manage_permissions"),
    validateIntParam("roleId"), validateIntParam("permissionId"), validateInputs,
    permissionController.removePermissionFromRole);

router.route("/roles/:roleId/permission-groups")
  .post(generalRateLimiter, ...requirePermission("role:manage_permissions"),
    validateIntParam("roleId"), validateGroupIds, validateInputs,
    permissionController.addGroupsToRole);

router.route("/roles/:roleId/permission-groups/:groupId")
  .delete(generalRateLimiter, ...requirePermission("role:manage_permissions"),
    validateIntParam("roleId"), validateIntParam("groupId"), validateInputs,
    permissionController.removeGroupFromRole);

// ─── User assignments ───────────────────────────────────────────────────────

router.route("/users/:userId/permissions")
  .post(generalRateLimiter, ...requirePermission("user:manage_permissions"),
    validateIntParam("userId"), validatePermissionIds, validateInputs,
    permissionController.addPermissionsToUser);

router.route("/users/:userId/permissions/:permissionId")
  .delete(generalRateLimiter, ...requirePermission("user:manage_permissions"),
    validateIntParam("userId"), validateIntParam("permissionId"), validateInputs,
    permissionController.removePermissionFromUser);

router.route("/users/:userId/permission-groups")
  .post(generalRateLimiter, ...requirePermission("user:manage_permissions"),
    validateIntParam("userId"), validateGroupIds, validateInputs,
    permissionController.addGroupsToUser);

router.route("/users/:userId/permission-groups/:groupId")
  .delete(generalRateLimiter, ...requirePermission("user:manage_permissions"),
    validateIntParam("userId"), validateIntParam("groupId"), validateInputs,
    permissionController.removeGroupFromUser);

router.route("/users/:userId/effective-permissions")
  .get(generalRateLimiter, ...requirePermission("permission:read"),
    validateIntParam("userId"), validateInputs,
    permissionController.getUserEffectivePermissions);

export default router;
