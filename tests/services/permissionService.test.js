/**
 * @file tests/services/permissionService.test.js
 * @description Capacidad solicitante implícita + resolución efectiva (permissionModel mockeado).
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const mockPermissionModel = {
  findUserWithPermissions: jest.fn(),
  findRoleWithPermissions: jest.fn(),
};

await jest.unstable_mockModule("../../models/permissionModel.js", () => mockPermissionModel);

const { TENANT_APPLICANT_CAPABILITY_CODES } = await import("../../config/tenantApplicantCapability.js");
const {
  loadEffectivePermissions,
  loadEffectivePermissionsForRole,
} = await import("../../services/permissionService.js");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("loadEffectivePermissions", () => {
  test("usuario inactivo → sin permisos", async () => {
    mockPermissionModel.findUserWithPermissions.mockResolvedValue({
      active: false,
      organization: { kind: "CLIENT" },
      role: null,
      userPermissions: [],
      userPermissionGroups: [],
    });
    await expect(loadEffectivePermissions(1)).resolves.toEqual([]);
  });

  test("usuario activo sin rol recibe capacidad solicitante del tenant", async () => {
    mockPermissionModel.findUserWithPermissions.mockResolvedValue({
      active: true,
      organization: { kind: "CLIENT" },
      role: null,
      userPermissions: [],
      userPermissionGroups: [],
    });
    const codes = await loadEffectivePermissions(42);
    for (const c of TENANT_APPLICANT_CAPABILITY_CODES) {
      expect(codes).toContain(c);
    }
    expect(codes.length).toBe(TENANT_APPLICANT_CAPABILITY_CODES.length);
  });

  test("usuario sin organización cargada no une capacidad solicitante", async () => {
    mockPermissionModel.findUserWithPermissions.mockResolvedValue({
      active: true,
      organization: null,
      role: null,
      userPermissions: [],
      userPermissionGroups: [],
    });
    const codes = await loadEffectivePermissions(3);
    expect(codes).toEqual([]);
  });

  test("une permisos del rol con capacidad solicitante", async () => {
    mockPermissionModel.findUserWithPermissions.mockResolvedValue({
      active: true,
      organization: { kind: "ROOT" },
      role: {
        rolePermissions: [{ permission: { code: "travel_request:authorize", active: true } }],
        rolePermissionGroups: [],
      },
      userPermissions: [],
      userPermissionGroups: [],
    });
    const codes = await loadEffectivePermissions(5);
    expect(codes).toContain("travel_request:authorize");
    expect(codes).toContain("travel_request:create");
  });
});

describe("loadEffectivePermissionsForRole", () => {
  test("rol sin grupos incluye capacidad solicitante (vista previa alineada)", async () => {
    mockPermissionModel.findRoleWithPermissions.mockResolvedValue({
      organization: { kind: "CLIENT" },
      rolePermissions: [],
      rolePermissionGroups: [],
    });
    const codes = await loadEffectivePermissionsForRole(9);
    for (const c of TENANT_APPLICANT_CAPABILITY_CODES) {
      expect(codes).toContain(c);
    }
    const sorted = [...codes].sort((a, b) => a.localeCompare(b));
    expect(codes).toEqual(sorted);
  });

  test("rol desconocido → []", async () => {
    mockPermissionModel.findRoleWithPermissions.mockResolvedValue(null);
    await expect(loadEffectivePermissionsForRole(999)).resolves.toEqual([]);
  });
});
