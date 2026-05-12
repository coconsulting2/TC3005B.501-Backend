import { jest, describe, test, expect, beforeEach } from "@jest/globals";

const mockAuthorizer = {
  getManagerUserId: jest.fn(),
  getDirectSubordinates: jest.fn(),
};

await jest.unstable_mockModule("../../models/authorizerModel.js", () => ({
  default: mockAuthorizer,
}));

const {
  getApprovalChain,
  getSubordinatesRecursive,
  getHierarchyDepth,
} = await import("../../services/employeeHierarchyService.js");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("employeeHierarchyService", () => {
  test("getApprovalChain regresa jefes en orden ascendente de nivel", async () => {
    mockAuthorizer.getManagerUserId
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(30)
      .mockResolvedValueOnce(null);

    const chain = await getApprovalChain(10, 5);
    expect(chain).toEqual([20, 30]);
  });

  test("getApprovalChain detecta ciclos", async () => {
    mockAuthorizer.getManagerUserId
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(10);

    await expect(getApprovalChain(10, 5)).rejects.toMatchObject({ status: 409 });
  });

  test("getSubordinatesRecursive navega subordinados transitivos", async () => {
    mockAuthorizer.getDirectSubordinates
      .mockResolvedValueOnce([20, 30]) // de 10
      .mockResolvedValueOnce([40]) // de 20
      .mockResolvedValueOnce([]) // de 30
      .mockResolvedValueOnce([]); // de 40

    const subs = await getSubordinatesRecursive(10);
    expect(subs).toEqual([20, 30, 40]);
  });

  test("getHierarchyDepth usa longitud de la cadena", async () => {
    mockAuthorizer.getManagerUserId
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(null);
    const depth = await getHierarchyDepth(10);
    expect(depth).toBe(1);
  });
});
