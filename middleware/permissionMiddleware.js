/**
 * @module permissionMiddleware
 * @description Granular permission middleware. Composes authenticateToken first so
 * route handlers cannot be exposed without authentication (defense against accidental
 * auth-bypass when refactoring routes).
 *
 * Public API:
 *   requirePermission(code1, ...)      → all listed permissions required (AND)
 *   requireAnyPermission(code1, ...)   → at least one required (OR)
 *
 * Internally these expand to:
 *   [authenticateToken, loadPermissions, authorizePermission(...)]
 */
import { authenticateToken } from "./authMiddleware.js";
import { InsufficientPermissionsError } from "./authErrors.js";
import { loadEffectivePermissions } from "../services/permissionService.js";

/**
 * Loads the effective permission set for the authenticated user into
 * req.user.permissionSet. Idempotent within a request — if the set is
 * already populated it returns immediately.
 *
 * @param {import("express").Request} req - Express request
 * @param {import("express").Response} res - Express response
 * @param {import("express").NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
export const loadPermissions = async (req, res, next) => {
  if (!req.user) {
    return next(new InsufficientPermissionsError());
  }
  if (req.user.permissionSet instanceof Set) {
    return next();
  }
  try {
    const codes = await loadEffectivePermissions(req.user.user_id);
    req.user.permissionSet = new Set(codes);
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Factory: returns middleware that requires ALL listed permission codes.
 * Must be used after loadPermissions (already wired by requirePermission).
 *
 * @param {...string} required - Permission codes that must all be present
 * @returns {import("express").RequestHandler} Express middleware
 */
export const authorizePermission = (...required) => {
  return (req, res, next) => {
    if (!req.user || !(req.user.permissionSet instanceof Set)) {
      return next(new InsufficientPermissionsError());
    }
    const ok = required.every((code) => req.user.permissionSet.has(code));
    if (!ok) {
      return next(new InsufficientPermissionsError());
    }
    next();
  };
};

/**
 * Factory: returns middleware that requires AT LEAST ONE of the listed permissions.
 *
 * @param {...string} required - Permission codes; at least one must be present
 * @returns {import("express").RequestHandler} Express middleware
 */
export const authorizeAnyPermission = (...required) => {
  return (req, res, next) => {
    if (!req.user || !(req.user.permissionSet instanceof Set)) {
      return next(new InsufficientPermissionsError());
    }
    const ok = required.some((code) => req.user.permissionSet.has(code));
    if (!ok) {
      return next(new InsufficientPermissionsError());
    }
    next();
  };
};

/**
 * Public helper: authenticate + load permissions + require all listed codes.
 * Always composes authenticateToken as first hop; impossible to skip.
 *
 * @param {...string} perms - Permission codes required (AND semantics)
 * @returns {import("express").RequestHandler[]} Middleware chain
 */
export const requirePermission = (...perms) => [
  authenticateToken,
  loadPermissions,
  authorizePermission(...perms),
];

/**
 * Public helper: authenticate + load permissions + require at least one listed code.
 *
 * @param {...string} perms - Permission codes (OR semantics)
 * @returns {import("express").RequestHandler[]} Middleware chain
 */
export const requireAnyPermission = (...perms) => [
  authenticateToken,
  loadPermissions,
  authorizeAnyPermission(...perms),
];
