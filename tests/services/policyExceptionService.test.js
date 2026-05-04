/**
 * @file tests/services/policyExceptionService.test.js
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const txClient = {
  policyException: { update: jest.fn() },
  receipt: { update: jest.fn() },
  solicitudHistorial: { create: jest.fn() },
};

const mockPrisma = {
  policyException: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  request: { findUnique: jest.fn() },
  $transaction: jest.fn(async (fn) => fn(txClient)),
};

const mockNotificationService = { createNotification: jest.fn().mockResolvedValue({}) };

await jest.unstable_mockModule("../../database/config/prisma.js", () => ({ default: mockPrisma }));
await jest.unstable_mockModule("../../services/notificationService.js", () => mockNotificationService);

const svc = await import("../../services/policyExceptionService.js");

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn) => fn(txClient));
});

describe("createException", () => {
  test("rejects justification with less than 10 chars", async () => {
    await expect(svc.createException({
      requestId: 1, requestedById: 5, amountClaimed: 100, excessAmount: 10, justification: "ok",
    })).rejects.toMatchObject({ status: 400 });
  });

  test("creates PENDING and notifies designated approvers from snapshot", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({
      requestId: 1, userId: 5,
      workflowPreSnapshot: { n1UserId: 10, n2UserId: 20 },
    });
    mockPrisma.policyException.create.mockResolvedValue({ exceptionId: 99, status: "PENDING" });

    const result = await svc.createException({
      requestId: 1, requestedById: 5,
      amountClaimed: 5000, excessAmount: 1000,
      justification: "Único hotel disponible cerca del congreso esta semana",
    });

    expect(result.exceptionId).toBe(99);
    expect(mockNotificationService.createNotification).toHaveBeenCalledTimes(2);
    expect(mockNotificationService.createNotification).toHaveBeenCalledWith(10, expect.stringContaining("excepción"));
    expect(mockNotificationService.createNotification).toHaveBeenCalledWith(20, expect.stringContaining("excepción"));
  });

  test("404 when request does not exist", async () => {
    mockPrisma.request.findUnique.mockResolvedValue(null);
    await expect(svc.createException({
      requestId: 999, requestedById: 5,
      amountClaimed: 1, excessAmount: 1, justification: "0123456789",
    })).rejects.toMatchObject({ status: 404 });
  });
});

describe("decideException", () => {
  test("rejects unknown decision values", async () => {
    await expect(svc.decideException(1, "MAYBE", 10)).rejects.toMatchObject({ status: 400 });
  });

  test("404 when exception does not exist", async () => {
    mockPrisma.policyException.findUnique.mockResolvedValue(null);
    await expect(svc.decideException(1, "APPROVED", 10)).rejects.toMatchObject({ status: 404 });
  });

  test("400 when already decided", async () => {
    mockPrisma.policyException.findUnique.mockResolvedValue({
      exceptionId: 1, status: "APPROVED", request: { workflowPreSnapshot: { n1UserId: 10 }, userId: 5 },
    });
    await expect(svc.decideException(1, "APPROVED", 10)).rejects.toMatchObject({ status: 400 });
  });

  test("403 when actor is not a designated approver", async () => {
    mockPrisma.policyException.findUnique.mockResolvedValue({
      exceptionId: 1, status: "PENDING", receiptId: 50, requestId: 5,
      request: { workflowPreSnapshot: { n1UserId: 10 }, userId: 5 },
    });
    await expect(svc.decideException(1, "APPROVED", 999)).rejects.toMatchObject({ status: 403 });
  });

  test("APPROVED sets Receipt.refund=true and inserts SolicitudHistorial APROBADO", async () => {
    mockPrisma.policyException.findUnique.mockResolvedValue({
      exceptionId: 1, status: "PENDING", receiptId: 50, requestId: 5,
      request: { workflowPreSnapshot: { n1UserId: 10 }, userId: 7 },
    });
    txClient.policyException.update.mockResolvedValue({ exceptionId: 1, status: "APPROVED" });

    await svc.decideException(1, "APPROVED", 10, "Justificada");

    expect(txClient.receipt.update).toHaveBeenCalledWith({ where: { receiptId: 50 }, data: { refund: true } });
    expect(txClient.solicitudHistorial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ requestId: 5, userId: 10, accion: "APROBADO" }),
    });
    expect(mockNotificationService.createNotification).toHaveBeenCalledWith(7, expect.stringContaining("aprobada"));
  });

  test("REJECTED sets Receipt.refund=false and inserts SolicitudHistorial RECHAZADO", async () => {
    mockPrisma.policyException.findUnique.mockResolvedValue({
      exceptionId: 1, status: "PENDING", receiptId: 50, requestId: 5,
      request: { workflowPreSnapshot: { n2UserId: 20 }, userId: 7 },
    });
    txClient.policyException.update.mockResolvedValue({ exceptionId: 1, status: "REJECTED" });

    await svc.decideException(1, "REJECTED", 20);

    expect(txClient.receipt.update).toHaveBeenCalledWith({ where: { receiptId: 50 }, data: { refund: false } });
    expect(txClient.solicitudHistorial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: "RECHAZADO" }),
    });
  });
});

describe("listPendingForApprover", () => {
  test("filters by approver presence in workflowPreSnapshot", async () => {
    mockPrisma.policyException.findMany.mockResolvedValue([
      { exceptionId: 1, request: { workflowPreSnapshot: { n1UserId: 10 } } },
      { exceptionId: 2, request: { workflowPreSnapshot: { n2UserId: 20 } } },
      { exceptionId: 3, request: { workflowPreSnapshot: null } }, // empty → visible to anyone
    ]);
    const result = await svc.listPendingForApprover(10);
    const ids = result.map((e) => e.exceptionId).sort();
    expect(ids).toEqual([1, 3]);
  });
});
