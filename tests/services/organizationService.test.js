/**
 * @file tests/services/organizationService.test.js
 * @description Tests del flujo CRUD de organizaciones (multi-tenant baseline).
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const mockPrisma = {
  organization: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  role: { upsert: jest.fn(), findUnique: jest.fn() },
  permissionGroup: { upsert: jest.fn() },
  permission: { findMany: jest.fn() },
  permissionGroupItem: { createMany: jest.fn() },
  rolePermissionGroup: { createMany: jest.fn() },
  alertMessage: { findFirst: jest.fn(), create: jest.fn() },
  receiptType: { upsert: jest.fn() },
  notificationTemplate: { upsert: jest.fn() },
  reimbursementTimeLimit: { upsert: jest.fn() },
  chartOfAccount: { upsert: jest.fn() },
  accountingDocType: { upsert: jest.fn() },
  accountingSociety: { upsert: jest.fn() },
  user: { upsert: jest.fn() },
  $executeRaw: jest.fn().mockResolvedValue(1),
  $executeRawUnsafe: jest.fn(),
  $transaction: jest.fn(async (fn) => fn(mockPrisma)),
};

await jest.unstable_mockModule("../../database/config/prisma.js", () => ({
  default: mockPrisma,
}));
await jest.unstable_mockModule("../../database/config/rlsConnection.js", () => ({
  withRls: jest.fn(async (_orgId, _opts, fn) => fn(mockPrisma)),
  applyRlsSetting: jest.fn(),
  applyRlsForRequest: jest.fn(),
}));
await jest.unstable_mockModule("../../prisma/seedHelpers/bootstrapOrganization.js", () => ({
  bootstrapOrganizationCatalogs: jest.fn(async () => ({ rolesByName: new Map(), groupsByName: new Map() })),
  ensureOrganizationAdmin: jest.fn(async () => undefined),
}));

const svc = await import("../../services/organizationService.js");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createOrganization", () => {
  test("rechaza nombre vacío", async () => {
    await expect(svc.createOrganization({ nombre: "  ", adminEmail: "a@b.com", adminPassword: "x" })).rejects.toThrow(
      /nombre/i
    );
  });

  test("rechaza si falta email del admin", async () => {
    await expect(svc.createOrganization({ nombre: "Acme", adminPassword: "x" })).rejects.toThrow(/email/i);
  });

  test("rechaza RFC mal formado", async () => {
    await expect(
      svc.createOrganization({
        nombre: "Acme",
        rfc: "INVALID",
        adminEmail: "a@b.com",
        adminNombre: "A B",
        adminPassword: "Secret123",
      })
    ).rejects.toThrow(/RFC/i);
  });

  test("acepta RFC opcional null", async () => {
    mockPrisma.organization.create.mockResolvedValue({
      id: 42n,
      nombre: "Acme",
      rfc: null,
      kind: "CLIENT",
      status: "CONFIGURING",
      timezone: "America/Mexico_City",
      baseCurrency: "MXN",
      logoUrl: null,
      razonSocial: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await svc.createOrganization({
      nombre: "Acme",
      rfc: null,
      adminEmail: "a@b.com",
      adminNombre: "A B",
      adminPassword: "Secret123",
    });

    expect(res.organization.id).toBe("42");
    expect(res.organization.rfc).toBeNull();
    expect(mockPrisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ nombre: "Acme", kind: "CLIENT", status: "CONFIGURING", rfc: null }),
    });
  });
});

describe("suspendOrganization", () => {
  test("no permite suspender la ROOT (id=1)", async () => {
    await expect(svc.suspendOrganization(1)).rejects.toThrow(/ROOT/i);
  });

  test("suspende org cliente normal", async () => {
    mockPrisma.organization.update.mockResolvedValue({
      id: 5n,
      nombre: "X",
      kind: "CLIENT",
      status: "SUSPENDED",
      timezone: "America/Mexico_City",
      baseCurrency: "MXN",
      logoUrl: null,
      razonSocial: null,
      rfc: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await svc.suspendOrganization(5);
    expect(res.status).toBe("SUSPENDED");
    expect(mockPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: 5n },
      data: { status: "SUSPENDED" },
    });
  });
});

describe("listOrganizations", () => {
  test("filtra por kind y status", async () => {
    mockPrisma.organization.findMany.mockResolvedValue([]);
    mockPrisma.organization.count.mockResolvedValue(0);
    const res = await svc.listOrganizations({ kind: "CLIENT", status: "ACTIVE", page: 1, pageSize: 10 });
    expect(res.total).toBe(0);
    expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kind: "CLIENT", status: "ACTIVE" },
        skip: 0,
        take: 10,
      })
    );
  });
});
