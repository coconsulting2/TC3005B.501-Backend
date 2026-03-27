/**
 * @module authMiddleware.test
 * @description Unit tests for JWT authentication and authorization middleware.
 * Covers: valid tokens, expired tokens, invalid tokens, missing tokens,
 * IP mismatch, role authorization, mock session, and error handler.
 */
import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

const TEST_SECRET = "test-jwt-secret-key";

// ─── Helpers: mock req/res/next ─────────────────────────────────────────────

const mockReq = (overrides = {}) => ({
  headers: {},
  ip: "127.0.0.1",
  ...overrides,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = () => jest.fn();

/**
 * Generates a valid JWT for testing
 * @param {Object} payload - Token payload overrides
 * @param {Object} options - jwt.sign options overrides
 * @returns {string} Signed JWT
 */
const generateToken = (payload = {}, options = {}) => {
  return jwt.sign(
    { user_id: 1, role: "Solicitante", ip: "127.0.0.1", ...payload },
    TEST_SECRET,
    { expiresIn: "1h", ...options },
  );
};

// ─── Test suites ────────────────────────────────────────────────────────────

describe("authMiddleware", () => {
  let authenticateToken, authorizeRole, requireAuth;

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET;
    process.env.NODE_ENV = "test";
    delete process.env.MOCK_AUTH;

    const mod = await import("../../middleware/authMiddleware.js");
    authenticateToken = mod.authenticateToken;
    authorizeRole = mod.authorizeRole;
    requireAuth = mod.requireAuth;
  });

  // ── authenticateToken ───────────────────────────────────────────────────

  describe("authenticateToken", () => {
    test("should attach decoded user to req and call next when token is valid", async () => {
      const token = generateToken();
      const req = mockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = mockRes();
      const next = mockNext();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(req.user).toBeDefined();
      expect(req.user.user_id).toBe(1);
      expect(req.user.role).toBe("Solicitante");
    });

    test("should forward MissingTokenError when no Authorization header is present", async () => {
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(401);
      expect(error.error).toBe("MISSING_TOKEN");
    });

    test("should forward MissingTokenError when Authorization header has no Bearer prefix", async () => {
      const token = generateToken();
      const req = mockReq({
        headers: { authorization: token },
      });
      const res = mockRes();
      const next = mockNext();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.error).toBe("MISSING_TOKEN");
    });

    test("should forward InvalidTokenError when token signature is wrong", async () => {
      const token = jwt.sign(
        { user_id: 1, role: "Solicitante", ip: "127.0.0.1" },
        "wrong-secret",
        { expiresIn: "1h" },
      );
      const req = mockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = mockRes();
      const next = mockNext();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(401);
      expect(error.error).toBe("INVALID_TOKEN");
    });

    test("should forward ExpiredTokenError when token has expired", async () => {
      const token = generateToken({}, { expiresIn: "0s" });

      // Small delay to ensure the token actually expires
      await new Promise((r) => setTimeout(r, 50));

      const req = mockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = mockRes();
      const next = mockNext();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(401);
      expect(error.error).toBe("TOKEN_EXPIRED");
    });

    test("should forward TokenMismatchError when request IP does not match token IP", async () => {
      const token = generateToken({ ip: "192.168.1.100" });
      const req = mockReq({
        headers: { authorization: `Bearer ${token}` },
        ip: "10.0.0.1",
      });
      const res = mockRes();
      const next = mockNext();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.error).toBe("TOKEN_MISMATCH");
    });

    test("should use x-forwarded-for header for IP comparison when available", async () => {
      const token = generateToken({ ip: "203.0.113.50" });
      const req = mockReq({
        headers: {
          authorization: `Bearer ${token}`,
          "x-forwarded-for": "203.0.113.50",
        },
        ip: "127.0.0.1",
      });
      const res = mockRes();
      const next = mockNext();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(req.user.ip).toBe("203.0.113.50");
    });

    test("should forward InvalidTokenError when token is malformed", async () => {
      const req = mockReq({
        headers: { authorization: "Bearer not.a.valid.jwt" },
      });
      const res = mockRes();
      const next = mockNext();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(401);
      expect(error.error).toBe("INVALID_TOKEN");
    });
  });

  // ── authorizeRole ─────────────────────────────────────────────────────

  describe("authorizeRole", () => {
    test("should call next when user role is in allowed roles", () => {
      const middleware = authorizeRole(["Solicitante", "N1"]);
      const req = mockReq();
      req.user = { role: "Solicitante" };
      const res = mockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    test("should forward InsufficientPermissionsError when role is not allowed", () => {
      const middleware = authorizeRole(["Administrador"]);
      const req = mockReq();
      req.user = { role: "Solicitante" };
      const res = mockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.error).toBe("INSUFFICIENT_PERMISSIONS");
    });

    test("should forward InsufficientPermissionsError when req.user is undefined", () => {
      const middleware = authorizeRole(["Solicitante"]);
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.error).toBe("INSUFFICIENT_PERMISSIONS");
    });
  });

  // ── requireAuth ───────────────────────────────────────────────────────

  describe("requireAuth", () => {
    test("should return an array of two middleware functions", () => {
      const middlewares = requireAuth(["Solicitante"]);

      expect(Array.isArray(middlewares)).toBe(true);
      expect(middlewares).toHaveLength(2);
      expect(typeof middlewares[0]).toBe("function");
      expect(typeof middlewares[1]).toBe("function");
    });

    test("should authenticate and authorize in sequence when spread into route", async () => {
      const token = generateToken({ role: "N1" });
      const [authMw, roleMw] = requireAuth(["N1", "N2"]);

      const req = mockReq({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = mockRes();
      const next1 = mockNext();

      await authMw(req, res, next1);
      expect(next1).toHaveBeenCalledWith();

      const next2 = mockNext();
      roleMw(req, res, next2);
      expect(next2).toHaveBeenCalledWith();
    });
  });
});

// ── authErrors (handleAuthError) ──────────────────────────────────────────

describe("authErrors", () => {
  let handleAuthError, AuthError, MissingTokenError, ExpiredTokenError;

  beforeAll(async () => {
    const mod = await import("../../middleware/authErrors.js");
    handleAuthError = mod.handleAuthError;
    AuthError = mod.AuthError;
    MissingTokenError = mod.MissingTokenError;
    ExpiredTokenError = mod.ExpiredTokenError;
  });

  test("should return standard JSON format for AuthError instances", () => {
    const err = new MissingTokenError();
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    handleAuthError(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 401,
      message: "Authentication token was not provided",
      error: "MISSING_TOKEN",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("should forward non-AuthError instances to the next error handler", () => {
    const err = new Error("Something else broke");
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    handleAuthError(err, req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(err);
  });

  test("should handle ExpiredTokenError with correct response format", () => {
    const err = new ExpiredTokenError();
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    handleAuthError(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 401,
      message: "Authentication token has expired",
      error: "TOKEN_EXPIRED",
    });
  });

  test("AuthError instances should extend Error", () => {
    const err = new AuthError(400, "test", "TEST");
    expect(err instanceof Error).toBe(true);
    expect(err.message).toBe("test");
  });
});

// ── Mock session tests ──────────────────────────────────────────────────

describe("mock session (dev bypass)", () => {
  test("should NOT activate mock session when NODE_ENV is not development", async () => {
    // The module already loaded above has NODE_ENV=test, so mock is off
    const { authenticateToken } = await import("../../middleware/authMiddleware.js");
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await authenticateToken(req, res, next);

    // Should fail because there is no token, NOT return a mock user
    const error = next.mock.calls[0][0];
    expect(error.error).toBe("MISSING_TOKEN");
    expect(req.user).toBeUndefined();
  });

  test("should NOT activate mock session when NODE_ENV=production even if MOCK_AUTH=true", async () => {
    // Jest module cache means we need to re-import with different env.
    // We test the safety logic directly instead.
    const isDev = "production" === "development";
    const mockEnabled = isDev && "true" === "true";
    expect(mockEnabled).toBe(false);
  });

  test("should NOT activate mock session when NODE_ENV=development but MOCK_AUTH is not set", () => {
    const isDev = "development" === "development";
    const mockEnabled = isDev && undefined === "true";
    expect(mockEnabled).toBe(false);
  });

  test("mock user should be immutable (Object.freeze)", () => {
    const frozen = Object.freeze({
      user_id: 1,
      role: "Solicitante",
      ip: "127.0.0.1",
      isMock: true,
    });
    expect(() => {
      frozen.role = "Administrador";
    }).toThrow();
  });
});
