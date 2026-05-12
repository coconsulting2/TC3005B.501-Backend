import { jest, describe, test, expect, beforeEach } from "@jest/globals";
process.env.JWT_SECRET ??= "test-secret";

const mockUserModel = {
  getUserUsername: jest.fn(),
  getUserData: jest.fn(),
};

const mockBcrypt = {
  compare: jest.fn(),
};

const mockJwt = {
  sign: jest.fn(),
};

await jest.unstable_mockModule("../../models/userModel.js", () => ({
  default: mockUserModel,
}));
await jest.unstable_mockModule("bcrypt", () => ({
  default: mockBcrypt,
}));
await jest.unstable_mockModule("jsonwebtoken", () => ({
  default: mockJwt,
}));

const { authenticateUser } = await import("../../services/userService.js");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("userService.authenticateUser", () => {
  test("incluye no_empleado y datos de empleado en token/response", async () => {
    mockUserModel.getUserUsername.mockResolvedValue({
      user_name: "gabriela",
      user_id: 11,
      department_id: 2,
      password: "hash",
      active: true,
      role_name: "Solicitante",
      organization_id: 1n,
      organization_kind: "CLIENT",
      organization_status: "ACTIVE",
      no_empleado: "Emp001",
      empleado_ceco: "101",
      empleado_proveedor: "20000000008",
      empleado_jefe_inmediato: null,
    });
    mockBcrypt.compare.mockResolvedValue(true);
    mockJwt.sign.mockReturnValue("jwt-token");

    const req = { ip: "127.0.0.1" };
    const result = await authenticateUser("gabriela", "secret", req);

    expect(mockJwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 11,
        no_empleado: "Emp001",
      }),
      expect.any(String),
      expect.any(Object),
    );
    expect(result.no_empleado).toBe("Emp001");
    expect(result.empleado_ceco).toBe("101");
    expect(result.empleado_proveedor).toBe("20000000008");
  });
});
