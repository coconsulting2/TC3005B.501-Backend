/**
 * @file tests/services/policyService.test.js
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const txClient = {
  travelPolicy: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  policyExpenseCap: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  request: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockPrisma = {
  ...txClient,
  $transaction: jest.fn(async (fn) => fn(txClient)),
};

await jest.unstable_mockModule("../../database/config/prisma.js", () => ({ default: mockPrisma }));
const svc = await import("../../services/policyService.js");

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn) => fn(txClient));
});

describe("policyService.createPolicy", () => {
  test("rejects when validFrom > validTo", async () => {
    await expect(svc.createPolicy(1n, {
      name: "X", destinationScope: "any",
      validFrom: "2026-12-01", validTo: "2026-01-01",
      caps: [],
    })).rejects.toMatchObject({ status: 400 });
  });

  test("rejects when destinationScope is invalid", async () => {
    await expect(svc.createPolicy(1n, {
      name: "X", destinationScope: "lunar",
      validFrom: "2026-01-01",
      caps: [],
    })).rejects.toMatchObject({ status: 400 });
  });

  test("rejects on overlap with active policy", async () => {
    txClient.travelPolicy.findMany.mockResolvedValue([
      { policyId: 99, validFrom: new Date("2026-01-01"), validTo: null, active: true },
    ]);
    await expect(svc.createPolicy(1n, {
      name: "Nueva", destinationScope: "any",
      validFrom: "2026-06-01", validTo: "2026-12-31",
      caps: [],
    })).rejects.toMatchObject({ status: 409 });
  });

  test("creates policy with caps when no overlap", async () => {
    txClient.travelPolicy.findMany.mockResolvedValue([]);
    txClient.travelPolicy.create.mockResolvedValue({ policyId: 5 });
    txClient.policyExpenseCap.createMany.mockResolvedValue({ count: 1 });
    txClient.travelPolicy.findUnique.mockResolvedValue({ policyId: 5, expenseCaps: [], category: null });

    await svc.createPolicy(1n, {
      name: "P1", destinationScope: "nacional",
      validFrom: "2026-01-01", validTo: "2026-12-31",
      caps: [{ receiptTypeId: 1, capAmount: 2500, capUnit: "per_night", currency: "MXN" }],
    });

    expect(txClient.travelPolicy.create).toHaveBeenCalled();
    expect(txClient.policyExpenseCap.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ policyId: 5, receiptTypeId: 1, capAmount: 2500, capUnit: "per_night" })],
    });
  });
});

describe("policyService.updatePolicy", () => {
  test("throws 404 when policy is not in org", async () => {
    txClient.travelPolicy.findUnique.mockResolvedValueOnce(null);
    await expect(svc.updatePolicy(1, 1n, { name: "X" })).rejects.toMatchObject({ status: 404 });
  });

  test("setExpenseCaps replaces caps idempotently", async () => {
    txClient.travelPolicy.findUnique.mockResolvedValue({
      policyId: 1, orgId: 1n, validFrom: new Date("2026-01-01"), validTo: null, active: true, expenseCaps: [], category: null,
    });
    txClient.policyExpenseCap.deleteMany.mockResolvedValue({ count: 3 });
    txClient.policyExpenseCap.createMany.mockResolvedValue({ count: 2 });

    await svc.setExpenseCaps(1, 1n, [
      { receiptTypeId: 1, capAmount: 100, capUnit: "per_night" },
      { receiptTypeId: 2, capAmount: 200, capUnit: "per_day" },
    ]);
    expect(txClient.policyExpenseCap.deleteMany).toHaveBeenCalledWith({ where: { policyId: 1 } });
    expect(txClient.policyExpenseCap.createMany).toHaveBeenCalled();
  });

  test("rejects setExpenseCaps with invalid capUnit", async () => {
    txClient.travelPolicy.findUnique.mockResolvedValue({ policyId: 1, orgId: 1n });
    await expect(svc.setExpenseCaps(1, 1n, [{ receiptTypeId: 1, capAmount: 1, capUnit: "per_aeon" }]))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe("policyService.deactivatePolicy", () => {
  test("marks active=false", async () => {
    txClient.travelPolicy.findUnique.mockResolvedValue({ policyId: 1, orgId: 1n, active: true, expenseCaps: [], category: null });
    mockPrisma.travelPolicy.update.mockResolvedValue({ policyId: 1, active: false });
    const result = await svc.deactivatePolicy(1, 1n);
    expect(result.active).toBe(false);
  });
});

describe("policyService.snapshotPolicyForRequest", () => {
  test("freezes the matching policy into Request.policyEvaluationSnapshot", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({ requestId: 7, user: { orgId: 1n } });
    mockPrisma.travelPolicy.findMany.mockResolvedValue([{
      policyId: 1, orgId: 1n, name: "P1",
      categoryId: null, destinationScope: "any", costsCenter: null,
      dailyPerDiem: 1500, currency: "MXN",
      validFrom: new Date("2026-01-01"), validTo: null, active: true,
      expenseCaps: [{ capId: 1, policyId: 1, receiptTypeId: 1, capAmount: 2500, capUnit: "per_night", currency: "MXN" }],
    }]);
    mockPrisma.request.update.mockResolvedValue({});

    const result = await svc.snapshotPolicyForRequest(null, 7, { destinationScope: "nacional" });
    expect(result.policyId).toBe(1);
    expect(result.snapshot.policyId).toBe(1);
    expect(result.snapshot.requestId).toBe(7);
    expect(mockPrisma.request.update).toHaveBeenCalledWith({
      where: { requestId: 7 },
      data: { policyEvaluationSnapshot: expect.any(Object) },
    });
  });

  test("returns null snapshot when request has no orgId", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({ requestId: 7, user: null });
    const result = await svc.snapshotPolicyForRequest(null, 7, { destinationScope: "nacional" });
    expect(result.policyId).toBeNull();
    expect(result.snapshot).toBeNull();
  });
});
