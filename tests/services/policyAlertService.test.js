/**
 * @file tests/services/policyAlertService.test.js
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const mockPrisma = {
  request: { findUnique: jest.fn() },
  travelPolicy: { findMany: jest.fn() },
};

await jest.unstable_mockModule("../../database/config/prisma.js", () => ({ default: mockPrisma }));
const svc = await import("../../services/policyAlertService.js");

beforeEach(() => jest.clearAllMocks());

describe("checkReceiptBeforeSubmit", () => {
  test("404 when request does not exist", async () => {
    mockPrisma.request.findUnique.mockResolvedValue(null);
    await expect(svc.checkReceiptBeforeSubmit({
      requestId: 1, receiptTypeId: 1, amount: 100,
    })).rejects.toMatchObject({ status: 404 });
  });

  test("returns no-policy message when org has no applicable policy", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({
      requestId: 1, policyEvaluationSnapshot: null, user: { orgId: 1n }, routeRequests: [],
    });
    mockPrisma.travelPolicy.findMany.mockResolvedValue([]);
    const result = await svc.checkReceiptBeforeSubmit({ requestId: 1, receiptTypeId: 1, amount: 100 });
    expect(result.exceeded).toBe(false);
    expect(result.policyId).toBeNull();
    expect(result.message).toMatch(/No hay política aplicable/);
  });

  test("uses policyEvaluationSnapshot when present (RF-46 no retroactividad)", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({
      requestId: 1,
      policyEvaluationSnapshot: {
        policyId: 99, name: "Frozen", destinationScope: "any",
        currency: "MXN", validFrom: "2026-01-01", validTo: null,
        caps: [{ capId: 1, receiptTypeId: 1, capAmount: 1000, capUnit: "per_event", currency: "MXN" }],
      },
      user: { orgId: 1n },
      routeRequests: [],
    });
    const result = await svc.checkReceiptBeforeSubmit({ requestId: 1, receiptTypeId: 1, amount: 1500 });
    expect(result.policyId).toBe(99);
    expect(result.exceeded).toBe(true);
    expect(result.excessTotal).toBe(500);
    expect(mockPrisma.travelPolicy.findMany).not.toHaveBeenCalled();
  });

  test("returns ok when within cap", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({
      requestId: 1,
      policyEvaluationSnapshot: {
        policyId: 99, name: "P", destinationScope: "any", currency: "MXN", validFrom: "2026-01-01", validTo: null,
        caps: [{ capId: 1, receiptTypeId: 1, capAmount: 2500, capUnit: "per_night", currency: "MXN" }],
      },
      user: { orgId: 1n },
      routeRequests: [],
    });
    const result = await svc.checkReceiptBeforeSubmit({ requestId: 1, receiptTypeId: 1, amount: 4000, nights: 2 });
    expect(result.exceeded).toBe(false);
    expect(result.message).toMatch(/Dentro de la política/);
  });
});
