import { describe, expect, test } from "@jest/globals";
import {
  buildSnapshot,
  initialStatusFromLevels,
  maxLevelFromImporteBands,
  statusAfterN1Approval,
} from "../../services/workflowRulesEngine.js";

/** @returns {import('../../services/workflowRulesEngine.js').WorkflowRuleRow} */
function ir(id, threshold, approvalLevel, skipIfBelow = null) {
  return {
    id: BigInt(id),
    orgId: BigInt(1),
    ruleType: "pre",
    paramType: "importe",
    threshold,
    paramValue: null,
    approvalLevel,
    skipIfBelow,
    priority: 0,
    active: true,
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
});
