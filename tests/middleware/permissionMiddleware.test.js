/**
 * @module permissionMiddleware.test
 * @description Unit tests for the granular permission middleware.
 * Covers: requirePermission composes authenticateToken, loadPermissions caches,
 * authorizePermission AND semantics, authorizeAnyPermission OR semantics,
 * 403 when req.user or permissionSet is missing.
 */
import { jest } from "@jest/globals";

// Stub the service module before importing the middleware so we control permission loads.
jest.unstable_mockModule("../../services/permissionService.js", () => ({
  loadEffectivePermissions: jest.fn(),
}));

// Stub authenticateToken so we can observe its presence in the returned chains.
jest.unstable_mockModule("../../middleware/authMiddleware.js", () => ({
  authenticateToken: jest.fn((req, res, next) => next()),
  authorizeRole: jest.fn(),
  requireAuth: jest.fn(),
}));

const { loadEffectivePermissions } = await import("../../services/permissionService.js");
const { authenticateToken } = await import("../../middleware/authMiddleware.js");
const {
  loadPermissions,
  authorizePermission,
  authorizeAnyPermission,
  requirePermission,
  requireAnyPermission,
} = await import("../../middleware/permissionMiddleware.js");
const { InsufficientPermissionsError } = await import("../../middleware/authErrors.js");

const mockReq = (overrides = {}) => ({ ...overrides });
const mockRes = () => ({});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("loadPermissions", () => {
  test("403s when req.user is missing", async () => {
    const req = mockReq();
    const next = jest.fn();
    await loadPermissions(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(InsufficientPermissionsError));
  });

  test("loads and caches the permission set on req.user.permissionSet", async () => {
    loadEffectivePermissions.mockResolvedValue(["a:b", "c:d"]);
    const req = mockReq({ user: { user_id: 42 } });
    const next = jest.fn();
    await loadPermissions(req, mockRes(), next);
    expect(loadEffectivePermissions).toHaveBeenCalledWith(42);
    expect(req.user.permissionSet).toBeInstanceOf(Set);
    expect(req.user.permissionSet.has("a:b")).toBe(true);
    expect(next).toHaveBeenCalledWith();
  });

  test("is idempotent — does not re-query when permissionSet already exists", async () => {
    const existing = new Set(["x:y"]);
    const req = mockReq({ user: { user_id: 1, permissionSet: existing } });
    const next = jest.fn();
    await loadPermissions(req, mockRes(), next);
    expect(loadEffectivePermissions).not.toHaveBeenCalled();
    expect(req.user.permissionSet).toBe(existing);
    expect(next).toHaveBeenCalledWith();
  });

  test("forwards errors from the service to next()", async () => {
    const boom = new Error("db down");
    loadEffectivePermissions.mockRejectedValue(boom);
    const req = mockReq({ user: { user_id: 1 } });
    const next = jest.fn();
    await loadPermissions(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});

describe("authorizePermission (AND semantics)", () => {
  test("passes when all required codes are present", () => {
    const req = mockReq({ user: { permissionSet: new Set(["a", "b", "c"]) } });
    const next = jest.fn();
    authorizePermission("a", "b")(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  test("rejects when any code is missing", () => {
    const req = mockReq({ user: { permissionSet: new Set(["a"]) } });
    const next = jest.fn();
    authorizePermission("a", "b")(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(InsufficientPermissionsError));
  });

  test("rejects when permissionSet is absent (defense in depth)", () => {
    const req = mockReq({ user: { user_id: 1 } });
    const next = jest.fn();
    authorizePermission("a")(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(InsufficientPermissionsError));
  });

  test("rejects when req.user is missing", () => {
    const req = mockReq();
    const next = jest.fn();
    authorizePermission("a")(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(InsufficientPermissionsError));
  });
});

describe("authorizeAnyPermission (OR semantics)", () => {
  test("passes when at least one code is present", () => {
    const req = mockReq({ user: { permissionSet: new Set(["b"]) } });
    const next = jest.fn();
    authorizeAnyPermission("a", "b", "c")(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  test("rejects when none are present", () => {
    const req = mockReq({ user: { permissionSet: new Set(["z"]) } });
    const next = jest.fn();
    authorizeAnyPermission("a", "b")(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(InsufficientPermissionsError));
  });
});

describe("requirePermission + requireAnyPermission composition", () => {
  test("requirePermission returns [authenticateToken, loadPermissions, authorize]", () => {
    const chain = requirePermission("a", "b");
    expect(chain).toHaveLength(3);
    expect(chain[0]).toBe(authenticateToken); // auth FIRST — no bypass
    expect(chain[1]).toBe(loadPermissions);
    expect(typeof chain[2]).toBe("function");
  });

  test("requireAnyPermission returns [authenticateToken, loadPermissions, authorizeAny]", () => {
    const chain = requireAnyPermission("a", "b");
    expect(chain).toHaveLength(3);
    expect(chain[0]).toBe(authenticateToken);
    expect(chain[1]).toBe(loadPermissions);
    expect(typeof chain[2]).toBe("function");
  });
});
