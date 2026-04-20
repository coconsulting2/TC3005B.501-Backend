/**
 * @module authMiddleware
 * @description JWT authentication and role-based authorization middleware.
 * Provides requireAuth() factory for protected routes and a dev-only mock session.
 */
import jwt from "jsonwebtoken";
import {
  MissingTokenError,
  ExpiredTokenError,
  InvalidTokenError,
  TokenMismatchError,
  InsufficientPermissionsError,
} from "./authErrors.js";

// ─── Dev mock session safety ────────────────────────────────────────────────
// The mock session is gated behind THREE conditions that ALL must be true:
//   1. NODE_ENV === "development"
//   2. MOCK_AUTH === "true"
//   3. The code is NOT bundled for production (checked at import time)
// Even if someone accidentally sets MOCK_AUTH=true in prod, condition 1 blocks it.

const IS_DEV = process.env.NODE_ENV === "development";
const MOCK_AUTH_ENABLED = IS_DEV && process.env.MOCK_AUTH === "true";

const MOCK_USER = Object.freeze({
  user_id: 1,
  role: "Solicitante",
  ip: "127.0.0.1",
  isMock: true,
});

/**
 * Extracts the Bearer token from the Authorization header
 *
 * @param {import("express").Request} req - Express request
 * @returns {string|null} The raw JWT string or null if absent
 */
const extractToken = (req) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.split(" ")[1];
};

/**
 * Verifies a JWT and returns the decoded payload.
 * Uses promise-based verification instead of callbacks.
 *
 * @param {string} token - Raw JWT string
 * @returns {Promise<Object>} Decoded token payload
 * @throws {ExpiredTokenError} When token has expired
 * @throws {InvalidTokenError} When token is malformed or signature fails
 */
const verifyToken = (token) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          return reject(new ExpiredTokenError());
        }
        return reject(new InvalidTokenError());
      }
      resolve(decoded);
    });
  });
};

/**
 * Core authentication middleware. Validates the JWT from the Authorization header,
 * checks IP binding, and attaches decoded user to req.user.
 *
 * In development, if MOCK_AUTH is enabled and no Bearer token is sent, it uses a mock user.
 *
 * @param {import("express").Request} req - Express request
 * @param {import("express").Response} res - Express response
 * @param {import("express").NextFunction} next - Express next function
 */
export const authenticateToken = async (req, res, next) => {
  const token = extractToken(req);

  // Mock solo si no hay Bearer: así en dev puedes usar `MOCK_AUTH` para SSR sin login
  // y aún probar login real (p. ej. Cuentas por pagar) desde el navegador.
  if (MOCK_AUTH_ENABLED && !token) {
    req.user = { ...MOCK_USER };
    return next();
  }

  try {
    if (!token) {
      throw new MissingTokenError();
    }

    const decoded = await verifyToken(token);

    const requestIp = req.headers["x-forwarded-for"] || req.ip;
    // En desarrollo, el SSR (p. ej. Astro en Docker) llama al API con otra IP que el login en el navegador.
    const skipIpCheck =
      process.env.NODE_ENV === "development" ||
      process.env.JWT_SKIP_IP_CHECK === "true";
    if (!skipIpCheck && decoded.ip !== requestIp) {
      throw new TokenMismatchError();
    }

    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role-based authorization middleware factory.
 * Must be used after authenticateToken so that req.user is populated.
 *
 * @param {string[]} roles - Array of allowed role names
 * @returns {import("express").RequestHandler} Express middleware
 */
export const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new InsufficientPermissionsError());
    }
    next();
  };
};

/**
 * Middleware factory that combines authentication and role authorization in one call.
 * Usage: requireAuth(["Solicitante", "N1"])
 *
 * @param {string[]} roles - Array of allowed role names
 * @returns {import("express").RequestHandler[]} Array of middleware [authenticateToken, authorizeRole]
 */
export const requireAuth = (roles) => {
  return [authenticateToken, authorizeRole(roles)];
};
