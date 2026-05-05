/**
 * @file tests/services/scheduler/escalationJob.test.js
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const txClient = {
  request: { update: jest.fn() },
  solicitudHistorial: { create: jest.fn() },
};

const mockPrisma = {
  request: { findMany: jest.fn() },
  $transaction: jest.fn(async (fn) => fn(txClient)),
};
const mockNotificationService = { createNotification: jest.fn().mockResolvedValue({}) };

await jest.unstable_mockModule("../../../database/config/prisma.js", () => ({ default: mockPrisma }));
await jest.unstable_mockModule("../../../services/notificationService.js", () => mockNotificationService);

const { runEscalationJob } = await import("../../../services/scheduler/escalationJob.js");

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn) => fn(txClient));
});

describe("runEscalationJob", () => {
  test("escalates request status=2 with levels [1,2] and old lastModDate", async () => {
    mockPrisma.request.findMany.mockResolvedValue([{
      requestId: 1,
      workflowPreSnapshot: { levels: [1, 2], n2UserId: 20 },
      userId: 5,
    }]);
    const result = await runEscalationJob();
    expect(result.escalated).toBe(1);
    expect(txClient.request.update).toHaveBeenCalledWith({ where: { requestId: 1 }, data: { requestStatusId: 3 } });
    expect(txClient.solicitudHistorial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accion: "ESCALADO", requestId: 1, userId: 20 }),
    });
    expect(mockNotificationService.createNotification).toHaveBeenCalledWith(20, expect.stringContaining("escalada"));
  });

  test("does NOT escalate when snapshot has only level [1]", async () => {
    mockPrisma.request.findMany.mockResolvedValue([{
      requestId: 1,
      workflowPreSnapshot: { levels: [1], n1UserId: 10 },
      userId: 5,
    }]);
    const result = await runEscalationJob();
    expect(result.escalated).toBe(0);
    expect(txClient.request.update).not.toHaveBeenCalled();
  });

  test("idempotent: empty candidates return zero", async () => {
    mockPrisma.request.findMany.mockResolvedValue([]);
    const result = await runEscalationJob();
    expect(result).toEqual({ scanned: 0, escalated: 0 });
  });
});
