/**
 * @file tests/services/workflowNotificationService.test.js
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const mockPrisma = {
  notificationTemplate: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  request: { findUnique: jest.fn() },
};

const mockCreateNotification = jest.fn().mockResolvedValue({ notificationId: 1 });
const mockMail = jest.fn().mockResolvedValue(undefined);

await jest.unstable_mockModule("../../database/config/prisma.js", () => ({
  default: mockPrisma,
}));

await jest.unstable_mockModule("../../services/notificationService.js", () => ({
  createNotification: mockCreateNotification,
}));

await jest.unstable_mockModule("../../middleware/decryption.js", () => ({
  decrypt: jest.fn((v) => `decrypted-${v}`),
}));

await jest.unstable_mockModule("../../services/email/mail.cjs", () => ({
  Mail: mockMail,
}));

const {
  notifyRequestSubmitted,
  notifyRequestApproved,
  notifyRequestRejected,
  notifyRequestEscalated,
} = await import("../../services/workflowNotificationService.js");

describe("workflowNotificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockImplementation(async ({ where }) => ({
      userId: where.userId,
      userName: where.userId === 10 ? "Carlos" : "Ana",
      email: "enc",
      preference: null,
    }));
  });

  test("notifyRequestSubmitted notifica a N1 y al solicitante", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({
      requestId: 42,
      organizationId: 1n,
      userId: 5,
      workflowPreSnapshot: { n1UserId: 10 },
      requestStatus: { status: "Primera revisión" },
      user: { userName: "Ana" },
    });

    await notifyRequestSubmitted(42);

    expect(mockCreateNotification).toHaveBeenCalled();
    const n1Call = mockCreateNotification.mock.calls.find((c) => c[0] === 10);
    expect(n1Call).toBeTruthy();
    expect(n1Call[1]).toContain("42");
  });

  test("notifyRequestApproved notifica al solicitante", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({
      requestId: 7,
      organizationId: 1n,
      userId: 5,
      workflowPreSnapshot: {},
      requestStatus: { status: "Cotización del Viaje" },
      user: { userName: "Ana" },
    });

    await notifyRequestApproved(7, 10);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      5,
      expect.stringContaining("aprobada"),
    );
  });

  test("notifyRequestRejected incluye motivo", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({
      requestId: 9,
      organizationId: 1n,
      userId: 5,
      workflowPreSnapshot: {},
      requestStatus: { status: "Rechazado" },
      user: { userName: "Ana" },
    });

    await notifyRequestRejected(9, "Documentación incompleta");

    expect(mockCreateNotification).toHaveBeenCalledWith(
      5,
      expect.stringContaining("Documentación incompleta"),
    );
  });

  test("notifyRequestEscalated notifica a N2", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({
      requestId: 11,
      organizationId: 1n,
      userId: 5,
      workflowPreSnapshot: { n2UserId: 20 },
      requestStatus: { status: "Segunda revisión" },
      user: { userName: "Ana" },
    });
    mockPrisma.user.findUnique.mockImplementation(async ({ where }) => ({
      userId: where.userId,
      userName: "Kevin",
      email: "enc",
      preference: null,
    }));

    await notifyRequestEscalated(11);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      20,
      expect.stringContaining("11"),
    );
  });
});
