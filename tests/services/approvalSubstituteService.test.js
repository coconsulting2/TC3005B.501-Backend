import { beforeEach, describe, expect, jest, test } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const mockModel = {
  listByApprover: jest.fn(),
  createSubstitute: jest.fn(),
  deleteSubstitute: jest.fn(),
  getUserRoleName: jest.fn(),
  getActiveSubstitute: jest.fn(),
  listStalePendingRequests: jest.fn(),
  applyWorkflowAction: jest.fn(),
  createAlert: jest.fn(),
};

const mockLoadEffectivePermissions = jest.fn();

await jest.unstable_mockModule("../../models/approvalSubstituteModel.js", () => ({
  default: mockModel,
}));

await jest.unstable_mockModule("../../services/permissionService.js", () => ({
  loadEffectivePermissions: mockLoadEffectivePermissions,
}));

const { default: service } = await import(
  "../../services/approvalSubstituteService.js"
);

beforeEach(() => {
  jest.clearAllMocks();
  mockModel.createSubstitute.mockResolvedValue({ id: 1 });
  mockModel.getUserRoleName.mockResolvedValue("N1");
  mockLoadEffectivePermissions.mockResolvedValue(["travel_request:authorize"]);
});

describe("createSubstitute", () => {
  test("rejects notification-only role", async () => {
    mockModel.getUserRoleName
      .mockResolvedValueOnce("N1")
      .mockResolvedValueOnce("Observador");

    await expect(
      service.createSubstitute(10, 11, "2026-05-01T00:00:00Z", "2026-05-10T00:00:00Z"),
    ).rejects.toMatchObject({ status: 400 });

    expect(mockModel.createSubstitute).not.toHaveBeenCalled();
  });
});

describe("processStaleApprovals", () => {
  test("reassigns to active substitute and traces action", async () => {
    mockModel.listStalePendingRequests.mockResolvedValue([
      {
        requestId: 100,
        requestStatusId: 2,
        workflowPreSnapshot: { n1UserId: 10, n2UserId: 20, levels: [1, 2] },
      },
    ]);
    mockModel.getActiveSubstitute.mockResolvedValue({
      substituteId: 11,
    });

    const result = await service.processStaleApprovals(new Date("2026-06-01T12:00:00Z"));

    expect(result.reassigned).toBe(1);
    expect(mockModel.applyWorkflowAction).toHaveBeenCalled();
    expect(mockModel.createAlert).toHaveBeenCalledWith(100, 2);
  });
});
