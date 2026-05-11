/**
 * @file tests/services/reimbursementTimeService.test.js
 * @description Unit tests para reimbursementTimeService (M2-006 RF-37, RF-39).
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const mockPrisma = {
  reimbursementTimeLimit: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  request: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  solicitudHistorial: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (fn) => fn(mockPrisma)),
};

await jest.unstable_mockModule("../../database/config/prisma.js", () => ({
  default: mockPrisma,
}));

const svc = await import("../../services/reimbursementTimeService.js");

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
});

describe("getOrgTimeLimit", () => {
  test("returns defaults when no row exists", async () => {
    mockPrisma.reimbursementTimeLimit.findUnique.mockResolvedValue(null);
    const result = await svc.getOrgTimeLimit(1n);
    expect(result).toEqual({ daysAfterTrip: 14, graceDays: 0, blockOnExpiry: true, active: true });
  });

  test("returns persisted values", async () => {
    mockPrisma.reimbursementTimeLimit.findUnique.mockResolvedValue({
      daysAfterTrip: 7, graceDays: 3, blockOnExpiry: false, active: true,
    });
    const result = await svc.getOrgTimeLimit(1n);
    expect(result.daysAfterTrip).toBe(7);
    expect(result.blockOnExpiry).toBe(false);
  });
});

describe("setOrgTimeLimit", () => {
  test("upserts with provided values", async () => {
    mockPrisma.reimbursementTimeLimit.upsert.mockResolvedValue({ limitId: 1 });
    await svc.setOrgTimeLimit(1n, { daysAfterTrip: 30, graceDays: 5, blockOnExpiry: false }, 99);
    expect(mockPrisma.reimbursementTimeLimit.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 1n },
      update: expect.objectContaining({ daysAfterTrip: 30, graceDays: 5, blockOnExpiry: false, updatedById: 99 }),
      create: expect.objectContaining({ organizationId: 1n, daysAfterTrip: 30, graceDays: 5, blockOnExpiry: false, updatedById: 99 }),
    }));
  });

  test("falls back to defaults when fields are missing", async () => {
    mockPrisma.reimbursementTimeLimit.upsert.mockResolvedValue({ limitId: 1 });
    await svc.setOrgTimeLimit(1n, {});
    expect(mockPrisma.reimbursementTimeLimit.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ daysAfterTrip: 14, graceDays: 0, blockOnExpiry: true }),
    }));
  });
});

describe("computeDeadline", () => {
  beforeEach(() => {
    mockPrisma.reimbursementTimeLimit.findUnique.mockResolvedValue({
      daysAfterTrip: 14, graceDays: 0, blockOnExpiry: true, active: true,
    });
  });

  test("default 14 days from tripEndDate", async () => {
    const tripEnd = new Date("2026-05-01");
    const { deadline, gracePeriodEnd, daysAfterTrip } = await svc.computeDeadline(tripEnd, 1n);
    expect(daysAfterTrip).toBe(14);
    expect(deadline.toISOString().slice(0, 10)).toBe("2026-05-15");
    expect(gracePeriodEnd.getTime()).toBe(deadline.getTime());
  });

  test("with graceDays the gracePeriodEnd is later than deadline", async () => {
    mockPrisma.reimbursementTimeLimit.findUnique.mockResolvedValue({
      daysAfterTrip: 14, graceDays: 2, blockOnExpiry: true, active: true,
    });
    const tripEnd = new Date("2026-05-01");
    const { deadline, gracePeriodEnd } = await svc.computeDeadline(tripEnd, 1n);
    expect(gracePeriodEnd.getTime()).toBeGreaterThan(deadline.getTime());
    expect(gracePeriodEnd.toISOString().slice(0, 10)).toBe("2026-05-17");
  });
});

describe("isWithinDeadline", () => {
  test("returns true when no tripEndDate is set", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({ requestId: 1, tripEndDate: null, user: { organizationId: 1n } });
    expect(await svc.isWithinDeadline(1)).toBe(true);
  });

  test("returns true when current date is before deadline", async () => {
    const today = new Date();
    const recentEnd = new Date(today.getTime() - 5 * 86400000); // -5d
    mockPrisma.request.findUnique.mockResolvedValue({ requestId: 1, tripEndDate: recentEnd, user: { organizationId: 1n } });
    mockPrisma.reimbursementTimeLimit.findUnique.mockResolvedValue({
      daysAfterTrip: 14, graceDays: 0, blockOnExpiry: true, active: true,
    });
    expect(await svc.isWithinDeadline(1)).toBe(true);
  });

  test("returns false when past deadline", async () => {
    const oldEnd = new Date("2025-01-01");
    mockPrisma.request.findUnique.mockResolvedValue({ requestId: 1, tripEndDate: oldEnd, user: { organizationId: 1n } });
    mockPrisma.reimbursementTimeLimit.findUnique.mockResolvedValue({
      daysAfterTrip: 14, graceDays: 0, blockOnExpiry: true, active: true,
    });
    expect(await svc.isWithinDeadline(1)).toBe(false);
  });
});

describe("assertCanSubmitReceipts", () => {
  test("throws 403 when out-of-window and blockOnExpiry=true", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({
      requestId: 1, tripEndDate: new Date("2025-01-01"), user: { organizationId: 1n },
    });
    mockPrisma.reimbursementTimeLimit.findUnique.mockResolvedValue({
      daysAfterTrip: 14, graceDays: 0, blockOnExpiry: true, active: true,
    });
    await expect(svc.assertCanSubmitReceipts(1)).rejects.toMatchObject({ status: 403 });
  });

  test("does NOT throw when blockOnExpiry=false", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({
      requestId: 1, tripEndDate: new Date("2025-01-01"), user: { organizationId: 1n },
    });
    mockPrisma.reimbursementTimeLimit.findUnique.mockResolvedValue({
      daysAfterTrip: 14, graceDays: 0, blockOnExpiry: false, active: true,
    });
    await expect(svc.assertCanSubmitReceipts(1)).resolves.toBeUndefined();
  });

  test("does NOT throw when tripEndDate is null", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({ requestId: 1, tripEndDate: null, user: { organizationId: 1n } });
    await expect(svc.assertCanSubmitReceipts(1)).resolves.toBeUndefined();
  });
});

describe("lockExpiredRequests", () => {
  test("locks only requests past their deadline and not already terminal", async () => {
    const oldEnd = new Date("2025-01-01");
    mockPrisma.request.findMany.mockResolvedValue([
      { requestId: 1, tripEndDate: oldEnd, requestStatusId: 6, userId: 9, user: { organizationId: 1n, userId: 9 } },
      { requestId: 2, tripEndDate: new Date(), requestStatusId: 6, userId: 9, user: { organizationId: 1n, userId: 9 } }, // not expired
    ]);
    mockPrisma.reimbursementTimeLimit.findUnique.mockResolvedValue({
      daysAfterTrip: 14, graceDays: 0, blockOnExpiry: true, active: true,
    });
    mockPrisma.request.update.mockResolvedValue({});
    mockPrisma.solicitudHistorial.create.mockResolvedValue({});

    const result = await svc.lockExpiredRequests();
    expect(result.scanned).toBe(2);
    expect(result.locked).toBe(1);
    expect(mockPrisma.request.update).toHaveBeenCalledWith({ where: { requestId: 1 }, data: { requestStatusId: 8 } });
    expect(mockPrisma.solicitudHistorial.create).toHaveBeenCalledTimes(1);
  });

  test("skips org with blockOnExpiry=false", async () => {
    mockPrisma.request.findMany.mockResolvedValue([
      { requestId: 1, tripEndDate: new Date("2025-01-01"), requestStatusId: 6, userId: 9, user: { organizationId: 1n, userId: 9 } },
    ]);
    mockPrisma.reimbursementTimeLimit.findUnique.mockResolvedValue({
      daysAfterTrip: 14, graceDays: 0, blockOnExpiry: false, active: true,
    });
    const result = await svc.lockExpiredRequests();
    expect(result.locked).toBe(0);
    expect(mockPrisma.request.update).not.toHaveBeenCalled();
  });
});
