/**
 * @module authErrors
 * @description Custom error classes and centralized error handler for authentication/authorization.
 * Provides a standard response format: { statusCode, message, error }.
 */

/**
 * Base class for authentication errors
 * @extends Error
 */
export class AuthError extends Error {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Human-readable description
   * @param {string} error - Error category identifier
   */
  constructor(statusCode, message, error) {
    super(message);
    this.statusCode = statusCode;
    this.error = error;
  }
}

/**
 * Thrown when no token is provided in the request
 */
export class MissingTokenError extends AuthError {
  /**
   *
   */
  constructor() {
    super(401, "Authentication token was not provided", "MISSING_TOKEN");
  }
}

/**
 * Thrown when the token has expired
 */
export class ExpiredTokenError extends AuthError {
  /**
   *
   */
  constructor() {
    super(401, "Authentication token has expired", "TOKEN_EXPIRED");
  }
}

/**
 * Thrown when the token is malformed or signature is invalid
 */
export class InvalidTokenError extends AuthError {
  /**
   *
   */
  constructor() {
    super(401, "Authentication token is invalid", "INVALID_TOKEN");
  }
}

/**
 * Thrown when token IP does not match request IP
 */
export class TokenMismatchError extends AuthError {
  /**
   *
   */
  constructor() {
    super(403, "Token mismatch: unauthorized device", "TOKEN_MISMATCH");
  }
}

/**
 * Thrown when the user role is not allowed for the requested resource
 */
export class InsufficientPermissionsError extends AuthError {
  /**
   *
   */
  constructor() {
    super(403, "Access denied: insufficient permissions", "INSUFFICIENT_PERMISSIONS");
  }
}

/**
 * Centralized handler for auth errors. Sends standardized JSON responses.
 * Non-auth errors are forwarded to the next Express error handler.
 *
 * @param {Error} err - The error to handle
 * @param {import("express").Request} req - Express request
 * @param {import("express").Response} res - Express response
 * @param {import("express").NextFunction} next - Express next function
 */
export const handleAuthError = (err, req, res, next) => {
  if (err instanceof AuthError) {
    return res.status(err.statusCode).json({
      statusCode: err.statusCode,
      message: err.message,
      error: err.error,
    });
  }
  next(err);
};
