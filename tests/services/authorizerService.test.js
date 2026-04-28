/**
 * @file tests/services/authorizerService.test.js
 * @description Tests M2-005 montos + historial en authorizerService (model mockeado).
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const ACC = {
  APROBADO: "APROBADO",
  RECHAZADO: "RECHAZADO",
  ESCALADO: "ESCALADO",
  REASIGNADO: "REASIGNADO",
};

const mockModel = {
  SolicitudHistorialAccion: ACC,
  getRequestAuthorizationContext: jest.fn(),
  getUserRoleName: jest.fn(),
  getUserMaxApprovalAmount: jest.fn(),
  applyWorkflowAction: jest.fn(),
};

await jest.unstable_mockModule("../../models/authorizerModel.js", () => ({
  SolicitudHistorialAccion: ACC,
  default: mockModel,
}));

const { default: authorizerService } = await import(
  "../../services/authorizerService.js"
);

beforeEach(() => {
  jest.clearAllMocks();
  mockModel.applyWorkflowAction.mockResolvedValue(undefined);
});

describe("declineRequest", () => {
  test("400 si comentario vacío", async () => {
    await expect(
      authorizerService.declineRequest(1, 2, "   "),
    ).rejects.toMatchObject({ status: 400 });
    expect(mockModel.applyWorkflowAction).not.toHaveBeenCalled();
  });
});

describe("authorizeRequest — escalamiento por monto", () => {
  test("N1 con monto > tope y levels [1,2] → ESCALADO a status 3", async () => {
    mockModel.getRequestAuthorizationContext.mockResolvedValue({
      requestStatusId: 2,
      workflowPreSnapshot: { levels: [1, 2], n1UserId: 10 },
      requestedFee: 120_000,
      userId: 99,
    });
    mockModel.getUserRoleName.mockResolvedValue("N1");
    mockModel.getUserMaxApprovalAmount.mockResolvedValue(50_000);

    const result = await authorizerService.authorizeRequest(5, 10);

    expect(result.outcome).toBe("ESCALADO");
    expect(mockModel.applyWorkflowAction).toHaveBeenCalledWith(
      5,
      { statusId: 3 },
      10,
      ACC.ESCALADO,
      null,
    );
  });

  test("N1 con monto > tope y solo level [1] → 409", async () => {
    mockModel.getRequestAuthorizationContext.mockResolvedValue({
      requestStatusId: 2,
      workflowPreSnapshot: { levels: [1], n1UserId: 10 },
      requestedFee: 120_000,
      userId: 99,
    });
    mockModel.getUserRoleName.mockResolvedValue("N1");
    mockModel.getUserMaxApprovalAmount.mockResolvedValue(50_000);

    await expect(authorizerService.authorizeRequest(5, 10)).rejects.toMatchObject({
      status: 409,
    });
    expect(mockModel.applyWorkflowAction).not.toHaveBeenCalled();
  });

  test("N1 con monto dentro del tope → APROBADO", async () => {
    mockModel.getRequestAuthorizationContext.mockResolvedValue({
      requestStatusId: 2,
      workflowPreSnapshot: { levels: [1, 2], n1UserId: 10 },
      requestedFee: 10_000,
      userId: 99,
    });
    mockModel.getUserRoleName.mockResolvedValue("N1");
    mockModel.getUserMaxApprovalAmount.mockResolvedValue(50_000);

    const result = await authorizerService.authorizeRequest(5, 10);

    expect(result.outcome).toBe("APROBADO");
    expect(mockModel.applyWorkflowAction).toHaveBeenCalledWith(
      5,
      { statusId: 3 },
      10,
      ACC.APROBADO,
      null,
    );
  });
});
