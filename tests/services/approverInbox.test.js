/**
 * @file tests/services/approverInbox.test.js
 * @description Unit tests para `User.getTravelRequestsForApprover` — la bandeja
 *   N1/N2 basada en `workflow_pre_snapshot` (no en departamento).
 *
 *   El motor de reglas (`services/workflowRulesEngine.js`) sigue produciendo
 *   el snapshot; aquí sólo se prueba la lectura: que el filtro use el path
 *   correcto (`n1UserId` / `n2UserId`) y el fallback de jerarquía cuando
 *   `WORKFLOW_APPROVAL_MODE=hierarchy`.
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

process.env.NODE_ENV ??= "test";

const mockPrisma = {
  request: {
    findMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
};

await jest.unstable_mockModule("../../database/config/prisma.js", () => ({
  default: mockPrisma,
}));

const { default: User } = await import("../../models/userModel.js");

const RESULT_ROW = {
  requestId: 7001,
  userId: 42,
  requestStatus: { status: "Primera Revisión" },
  routeRequests: [
    {
      route: {
        destinationCountry: { countryName: "México" },
        beginningDate: new Date("2026-06-01"),
        endingDate: new Date("2026-06-05"),
      },
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.request.findMany.mockResolvedValue([RESULT_ROW]);
  mockPrisma.user.findMany.mockResolvedValue([]);
  delete process.env.WORKFLOW_APPROVAL_MODE;
});

describe("User.getTravelRequestsForApprover", () => {
  test("status_id inválido → []", async () => {
    const out = await User.getTravelRequestsForApprover(10, 9);
    expect(out).toEqual([]);
    expect(mockPrisma.request.findMany).not.toHaveBeenCalled();
  });

  test("actorUserId inválido → []", async () => {
    const out = await User.getTravelRequestsForApprover(NaN, 2);
    expect(out).toEqual([]);
    expect(mockPrisma.request.findMany).not.toHaveBeenCalled();
  });

  test("status 2 → filtra por workflow_pre_snapshot.n1UserId", async () => {
    await User.getTravelRequestsForApprover(10, 2, { organizationId: 101 });

    expect(mockPrisma.request.findMany).toHaveBeenCalledTimes(1);
    const args = mockPrisma.request.findMany.mock.calls[0][0];
    expect(args.where.requestStatusId).toBe(2);
    expect(args.where.organizationId).toBe(BigInt(101));
    expect(args.where.OR).toEqual([
      {
        workflowPreSnapshot: { path: ["n1UserId"], equals: 10 },
      },
    ]);
  });

  test("status 3 → filtra por workflow_pre_snapshot.n2UserId", async () => {
    await User.getTravelRequestsForApprover(6, 3, { organizationId: 101 });

    const args = mockPrisma.request.findMany.mock.calls[0][0];
    expect(args.where.requestStatusId).toBe(3);
    expect(args.where.OR[0]).toEqual({
      workflowPreSnapshot: { path: ["n2UserId"], equals: 6 },
    });
  });

  test("WORKFLOW_APPROVAL_MODE=hierarchy agrega fallback por subordinados a profundidad 1 (status 2)", async () => {
    process.env.WORKFLOW_APPROVAL_MODE = "hierarchy";
    mockPrisma.user.findMany.mockResolvedValueOnce([{ userId: 42 }, { userId: 43 }]);

    await User.getTravelRequestsForApprover(10, 2);

    const args = mockPrisma.request.findMany.mock.calls[0][0];
    expect(args.where.OR).toHaveLength(2);
    expect(args.where.OR[1]).toEqual({
      AND: [
        { workflowPreSnapshot: { equals: null } },
        { userId: { in: [42, 43] } },
      ],
    });
  });

  test("WORKFLOW_APPROVAL_MODE=hierarchy con profundidad 2 para status 3", async () => {
    process.env.WORKFLOW_APPROVAL_MODE = "hierarchy";
    mockPrisma.user.findMany
      .mockResolvedValueOnce([{ userId: 20 }]) // direct subs of 6
      .mockResolvedValueOnce([{ userId: 100 }, { userId: 101 }]); // direct subs of 20

    await User.getTravelRequestsForApprover(6, 3);

    const args = mockPrisma.request.findMany.mock.calls[0][0];
    expect(args.where.OR[1].AND[1]).toEqual({ userId: { in: [100, 101] } });
  });

  test("sin hierarchy mode no agrega fallback aunque haya subordinados", async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([{ userId: 42 }]);

    await User.getTravelRequestsForApprover(10, 2);

    const args = mockPrisma.request.findMany.mock.calls[0][0];
    expect(args.where.OR).toHaveLength(1);
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  test("mapea respuesta al shape esperado por el front", async () => {
    const out = await User.getTravelRequestsForApprover(10, 2);
    expect(out).toEqual([
      {
        request_id: 7001,
        user_id: 42,
        destination_country: "México",
        beginning_date: RESULT_ROW.routeRequests[0].route.beginningDate,
        ending_date: RESULT_ROW.routeRequests[0].route.endingDate,
        request_status: "Primera Revisión",
      },
    ]);
  });

  test("respeta limite n", async () => {
    await User.getTravelRequestsForApprover(10, 2, { n: 5 });
    const args = mockPrisma.request.findMany.mock.calls[0][0];
    expect(args.take).toBe(5);
  });

  test("sin organizationId no agrega filtro de tenant en el where", async () => {
    await User.getTravelRequestsForApprover(10, 2);
    const args = mockPrisma.request.findMany.mock.calls[0][0];
    expect(args.where.organizationId).toBeUndefined();
  });
});
