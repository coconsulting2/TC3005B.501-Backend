/**
 * @file tests/services/employeeCategoryService.test.js
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const mockPrisma = {
  employeeCategory: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

await jest.unstable_mockModule("../../database/config/prisma.js", () => ({ default: mockPrisma }));
const svc = await import("../../services/employeeCategoryService.js");

beforeEach(() => jest.clearAllMocks());

describe("employeeCategoryService", () => {
  test("listCategories filters by activeOnly default true", async () => {
    mockPrisma.employeeCategory.findMany.mockResolvedValue([]);
    await svc.listCategories(1n);
    expect(mockPrisma.employeeCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { orgId: 1n, active: true },
    }));
  });

  test("listCategories with activeOnly=false omits the filter", async () => {
    mockPrisma.employeeCategory.findMany.mockResolvedValue([]);
    await svc.listCategories(1n, { activeOnly: false });
    const call = mockPrisma.employeeCategory.findMany.mock.calls[0][0];
    expect(call.where.active).toBeUndefined();
  });

  test("getCategory returns null when row belongs to a different org", async () => {
    mockPrisma.employeeCategory.findUnique.mockResolvedValue({ categoryId: 5, orgId: 2n });
    const result = await svc.getCategory(5, 1n);
    expect(result).toBeNull();
  });

  test("createCategory maps P2002 unique violation to status 409", async () => {
    mockPrisma.employeeCategory.create.mockRejectedValue({ code: "P2002" });
    await expect(svc.createCategory(1n, { code: "EJEC", name: "Ejecutivo" })).rejects.toMatchObject({ status: 409 });
  });

  test("createCategory persists trimmed values", async () => {
    mockPrisma.employeeCategory.create.mockResolvedValue({ categoryId: 1 });
    await svc.createCategory(1n, { code: "  EJEC  ", name: "  Ejecutivo  ", description: "  desc " });
    expect(mockPrisma.employeeCategory.create).toHaveBeenCalledWith({
      data: { orgId: 1n, code: "EJEC", name: "Ejecutivo", description: "desc", active: true },
    });
  });

  test("updateCategory throws 404 when not found in org", async () => {
    mockPrisma.employeeCategory.findUnique.mockResolvedValue(null);
    await expect(svc.updateCategory(1, 1n, { name: "x" })).rejects.toMatchObject({ status: 404 });
  });

  test("deactivateCategory sets active=false", async () => {
    mockPrisma.employeeCategory.findUnique.mockResolvedValue({ categoryId: 1, orgId: 1n, active: true });
    mockPrisma.employeeCategory.update.mockResolvedValue({ active: false });
    const result = await svc.deactivateCategory(1, 1n);
    expect(result.active).toBe(false);
    expect(mockPrisma.employeeCategory.update).toHaveBeenCalledWith({ where: { categoryId: 1 }, data: { active: false } });
  });
});
