import { describe, expect, test } from "@jest/globals";
import {
  buildSnapshot,
  initialStatusFromLevels,
  maxLevelFromImporteBands,
  statusAfterN1Approval,
} from "../../services/workflowRulesEngine.js";

/** @returns {import('../../services/workflowRulesEngine.js').WorkflowRuleRow & { departmentId?: number | null, managerSteps?: number | null, targetRole?: string | null }} */
function ir(id, threshold, approvalLevel, skipIfBelow = null, extra = {}) {
  return {
    id: BigInt(id),
    organizationId: BigInt(1),
    ruleType: "pre",
    paramType: "importe",
    threshold,
    paramValue: null,
    approvalLevel,
    skipIfBelow,
    priority: 0,
    active: true,
    departmentId: null,
    managerSteps: null,
    targetRole: null,
    ...extra,
  };
}

describe("workflowRulesEngine", () => {
  test("maxLevelFromImporteBands picks smallest threshold band", () => {
    const rules = [
      ir(1, 5000, 1),
      ir(2, 999999999, 2),
    ];
    expect(maxLevelFromImporteBands(3000, rules)).toBe(1);
    expect(maxLevelFromImporteBands(8000, rules)).toBe(2);
  });

  test("skip_if_below removes lower tiers", () => {
    const rules = [
      ir(1, 5000, 1),
      ir(2, 999999999, 2),
      { ...ir(3, 999999999, 2, 3500), id: BigInt(3) },
    ];
    const snap = buildSnapshot(
      rules,
      {
        amount: 2000,
        currency: "MXN",
        destinationCountryIds: [],
        receiptTypeIds: [],
        orgLevel: null,
      },
      "pre",
      { n1UserId: 10, n2UserId: 20 },
    );
    expect(snap.levels).toEqual([2]);
    expect(snap.skipApplied).toBe(true);
    expect(initialStatusFromLevels(snap.levels)).toBe(3);
  });

  test("statusAfterN1Approval respects N2 requirement", () => {
    expect(statusAfterN1Approval([1, 2])).toBe(3);
    expect(statusAfterN1Approval([1])).toBe(4);
  });

  test("reglas con departmentId solo aplican al departamento del contexto", () => {
    const rules = [
      ir(1, 999999999, 2, null, { departmentId: 10 }),
      ir(2, 999999999, 1, null),
    ];
    const snapMatch = buildSnapshot(
      rules,
      { amount: 1000, currency: "MXN", departmentId: 10 },
      "pre",
      { n1UserId: 1, n2UserId: 2, approverIds: [1, 2] },
    );
    const snapOther = buildSnapshot(
      rules,
      { amount: 1000, currency: "MXN", departmentId: 99 },
      "pre",
      { n1UserId: 1, n2UserId: 2, approverIds: [1, 2] },
    );
    expect(snapMatch.maxApprovalLevel).toBe(2);
    expect(snapOther.maxApprovalLevel).toBe(1);
  });

  test("managerSteps eleva el nivel máximo de aprobación", () => {
    const rules = [
      ir(1, 999999999, 1, null, { managerSteps: 3 }),
    ];
    const snap = buildSnapshot(
      rules,
      { amount: 500, currency: "MXN" },
      "pre",
      { n1UserId: 10, n2UserId: 20, approverIds: [10, 20, 30] },
    );
    expect(snap.maxApprovalLevel).toBe(3);
    expect(snap.levels).toEqual([1, 2, 3]);
  });

  test("targetRole se toma de la última regla aplicable en scope", () => {
    const rules = [
      ir(1, 999999999, 1, null, { targetRole: "N1" }),
      ir(2, 5000, 2, null, { targetRole: "N2", paramType: "importe", threshold: 1000 }),
    ];
    const snap = buildSnapshot(
      rules,
      { amount: 2000, currency: "MXN" },
      "pre",
      { n1UserId: 10, n2UserId: 20, approverIds: [] },
    );
    expect(snap.targetRole).toBe("N2");
  });
});
