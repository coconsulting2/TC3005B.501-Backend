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

// M2-006 — el servicio ahora consulta excepciones pendientes antes de aprobar.
const mockPolicyExceptionService = {
  listPendingForRequest: jest.fn().mockResolvedValue([]),
  decideException: jest.fn().mockResolvedValue({}),
};
await jest.unstable_mockModule("../../services/policyExceptionService.js", () => mockPolicyExceptionService);

const mockAnticipoLifecycle = {
  onTravelRequestFullyApproved: jest.fn().mockResolvedValue(undefined),
};

await jest.unstable_mockModule("../../services/anticipoPolizaLifecycleService.js", () => ({
  default: mockAnticipoLifecycle,
}));

const mockHierarchyService = {
  getApprovalChain: jest.fn().mockResolvedValue([]),
};
await jest.unstable_mockModule("../../services/employeeHierarchyService.js", () => ({
  default: mockHierarchyService,
}));

const { default: authorizerService } = await import(
  "../../services/authorizerService.js"
);

beforeEach(() => {
  jest.clearAllMocks();
  mockModel.applyWorkflowAction.mockResolvedValue(undefined);
  mockPolicyExceptionService.listPendingForRequest.mockResolvedValue([]);
  mockAnticipoLifecycle.onTravelRequestFullyApproved.mockResolvedValue(undefined);
  mockHierarchyService.getApprovalChain.mockResolvedValue([]);
  delete process.env.WORKFLOW_APPROVAL_MODE;
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
    expect(mockAnticipoLifecycle.onTravelRequestFullyApproved).not.toHaveBeenCalled();
  });
});

describe("authorizeRequest — M2-006 PolicyException PENDING", () => {
  test("bloquea aprobación si hay excepciones PENDING (409)", async () => {
    mockModel.getRequestAuthorizationContext.mockResolvedValue({
      requestStatusId: 2,
      workflowPreSnapshot: { levels: [1], n1UserId: 10 },
      requestedFee: 1000,
      userId: 99,
    });
    mockModel.getUserRoleName.mockResolvedValue("N1");
    mockModel.getUserMaxApprovalAmount.mockResolvedValue(50_000);
    mockPolicyExceptionService.listPendingForRequest.mockResolvedValue([{ exceptionId: 1 }]);

    await expect(authorizerService.authorizeRequest(5, 10)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("excepciones de política"),
    });
    expect(mockModel.applyWorkflowAction).not.toHaveBeenCalled();
  });

  test("aprueba normalmente si no hay excepciones PENDING", async () => {
    mockModel.getRequestAuthorizationContext.mockResolvedValue({
      requestStatusId: 2,
      workflowPreSnapshot: { levels: [1], n1UserId: 10 },
      requestedFee: 1000,
      userId: 99,
    });
    mockModel.getUserRoleName.mockResolvedValue("N1");
    mockModel.getUserMaxApprovalAmount.mockResolvedValue(50_000);
    mockPolicyExceptionService.listPendingForRequest.mockResolvedValue([]);

    const result = await authorizerService.authorizeRequest(5, 10);
    expect(result.outcome).toBe("APROBADO");
    expect(mockAnticipoLifecycle.onTravelRequestFullyApproved).toHaveBeenCalledWith(5);
  });

  test("decideException delega a policyExceptionService", async () => {
    mockPolicyExceptionService.decideException.mockResolvedValue({ exceptionId: 7, status: "APPROVED" });
    const result = await authorizerService.decideException(7, "APPROVED", 10, "ok");
    expect(result.exceptionId).toBe(7);
    expect(mockPolicyExceptionService.decideException).toHaveBeenCalledWith(7, "APPROVED", 10, "ok");
  });
});

describe("authorizeRequest — coexistencia con modo jerárquico", () => {
  test("en modo hierarchy, permite aprobación de N1 lógico (jefe directo) aunque rol no sea N1", async () => {
    process.env.WORKFLOW_APPROVAL_MODE = "hierarchy";
    mockHierarchyService.getApprovalChain.mockResolvedValue([10, 20]);
    mockModel.getRequestAuthorizationContext.mockResolvedValue({
      requestStatusId: 2,
      workflowPreSnapshot: { levels: [1, 2], n1UserId: 99 },
      requestedFee: 1000,
      userId: 77,
    });
    mockModel.getUserRoleName.mockResolvedValue("CPP");
    mockModel.getUserMaxApprovalAmount.mockResolvedValue(50_000);

    const result = await authorizerService.authorizeRequest(5, 10);
    expect(result.outcome).toBe("APROBADO");
    expect(mockHierarchyService.getApprovalChain).toHaveBeenCalledWith(77, 4);
  });

  test("en modo hierarchy, rechaza si intenta aprobar alguien fuera de cadena", async () => {
    process.env.WORKFLOW_APPROVAL_MODE = "hierarchy";
    mockHierarchyService.getApprovalChain.mockResolvedValue([10, 20]);
    mockModel.getRequestAuthorizationContext.mockResolvedValue({
      requestStatusId: 2,
      workflowPreSnapshot: { levels: [1], n1UserId: 10 },
      requestedFee: 1000,
      userId: 77,
    });
    mockModel.getUserRoleName.mockResolvedValue("N1");
    mockModel.getUserMaxApprovalAmount.mockResolvedValue(50_000);

    await expect(authorizerService.authorizeRequest(5, 99)).rejects.toMatchObject({
      status: 400,
    });
  });
});
