import { describe, expect, test, jest, beforeEach } from "@jest/globals";

const UAT_RULES = [
  {
    id: 1n,
    organizationId: 101n,
    ruleType: "pre",
    paramType: "importe",
    threshold: 50000,
    paramValue: null,
    approvalLevel: 1,
    skipIfBelow: null,
    priority: 10,
    active: true,
    departmentId: null,
    managerSteps: null,
    targetRole: null,
  },
  {
    id: 2n,
    organizationId: 101n,
    ruleType: "pre",
    paramType: "importe",
    threshold: 999999999,
    paramValue: null,
    approvalLevel: 2,
    skipIfBelow: null,
    priority: 20,
    active: true,
    departmentId: null,
    managerSteps: null,
    targetRole: null,
  },
  {
    id: 3n,
    organizationId: 101n,
    ruleType: "pre",
    paramType: "importe",
    threshold: 999999999,
    paramValue: null,
    approvalLevel: 2,
    skipIfBelow: 50000,
    priority: 5,
    active: true,
    departmentId: null,
    managerSteps: null,
    targetRole: null,
  },
];

const findManyMock = jest.fn();

jest.unstable_mockModule("../../database/config/prisma.js", () => ({
  default: {
    workflowRule: {
      findMany: findManyMock,
    },
  },
}));

const { previewWorkflowRules } = await import("../../services/workflowRulePreviewService.js");

describe("workflowRulePreviewService", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    findManyMock.mockResolvedValue(UAT_RULES);
  });

  test("UAT seed: $10,000 → solo N2 con skip", async () => {
    const result = await previewWorkflowRules(101n, { amount: 10000 });
    expect(result.levels).toEqual([2]);
    expect(result.skipApplied).toBe(true);
    expect(result.initialStatusId).toBe(3);
    expect(result.summary).toMatch(/10,000/);
    expect(result.hints.some((h) => /skip/i.test(h))).toBe(true);
  });

  test("UAT seed: $50,000 → solo N1", async () => {
    const result = await previewWorkflowRules(101n, { amount: 50000 });
    expect(result.levels).toEqual([1]);
    expect(result.skipApplied).toBe(false);
    expect(result.initialStatusId).toBe(2);
  });

  test("UAT seed: $85,000 → N1 y N2", async () => {
    const result = await previewWorkflowRules(101n, { amount: 85000 });
    expect(result.levels).toEqual([1, 2]);
    expect(result.initialStatusId).toBe(2);
  });

  test("draftRule sin guardar refleja skip eliminado en borrador", async () => {
    const result = await previewWorkflowRules(101n, {
      amount: 10000,
      draftRule: {
        ruleType: "pre",
        paramType: "importe",
        threshold: 999999999,
        approvalLevel: 2,
        skipIfBelow: null,
        priority: 5,
      },
      editingRuleId: "3",
    });
    // Sin skip en el borrador, 10k cae en banda 50k → N1
    expect(result.levels).toEqual([1]);
    expect(result.skipApplied).toBe(false);
  });

  test("rechaza monto inválido", async () => {
    await expect(previewWorkflowRules(101n, { amount: -1 })).rejects.toMatchObject({
      status: 400,
    });
  });

  test("rechaza editingRuleId no numérico", async () => {
    await expect(
      previewWorkflowRules(101n, {
        amount: 10000,
        draftRule: { ruleType: "pre", paramType: "importe", approvalLevel: 1 },
        editingRuleId: "abc",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  test("defaultea currency inválida a MXN", async () => {
    const result = await previewWorkflowRules(101n, { amount: 10000, currency: 123 });
    expect(result.currencyEvaluated).toBe("MXN");
  });
});
