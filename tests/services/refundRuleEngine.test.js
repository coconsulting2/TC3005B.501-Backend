import { describe, expect, test } from "@jest/globals";
import {
  evaluateReceiptAgainstPolicy,
  findApplicablePolicy,
  summarizeRequestPolicyResult,
  buildPolicyEvaluationSnapshot,
} from "../../services/refundRuleEngine.js";

/** @returns {import("../../services/refundRuleEngine.js").TravelPolicyRow} */
function policy(overrides = {}) {
  return {
    policyId: 1,
    organizationId: 1,
    name: "Test policy",
    categoryId: null,
    destinationScope: "any",
    costsCenter: null,
    dailyPerDiem: 1500,
    currency: "MXN",
    validFrom: new Date("2026-01-01"),
    validTo: null,
    active: true,
    ...overrides,
  };
}

/** @returns {import("../../services/refundRuleEngine.js").ExpenseCapRow} */
function cap(overrides = {}) {
  return {
    capId: 100,
    policyId: 1,
    receiptTypeId: 1, // Hospedaje
    capAmount: 2500,
    capUnit: "per_night",
    currency: "MXN",
    ...overrides,
  };
}

describe("refundRuleEngine.evaluateReceiptAgainstPolicy", () => {
  test("returns ok=true when policy is null", () => {
    const r = evaluateReceiptAgainstPolicy({ receiptTypeId: 1, amount: 1000 }, [], null);
    expect(r.ok).toBe(true);
    expect(r.exceeded).toBe(false);
    expect(r.excessByCap).toEqual([]);
    expect(r.snapshot.policyId).toBeNull();
  });

  test("returns ok=true when no cap matches receipt type", () => {
    const r = evaluateReceiptAgainstPolicy(
      { receiptTypeId: 99, amount: 5000 },
      [cap()],
      policy(),
    );
    expect(r.ok).toBe(true);
    expect(r.excessByCap).toEqual([]);
  });

  test("under per_night cap returns ok=true with excess=0", () => {
    const r = evaluateReceiptAgainstPolicy(
      { receiptTypeId: 1, amount: 4000, nights: 2 }, // 2000/noche
      [cap({ capAmount: 2500, capUnit: "per_night" })],
      policy(),
    );
    expect(r.ok).toBe(true);
    expect(r.excessByCap[0].excess).toBe(0);
    expect(r.excessByCap[0].excessTotal).toBe(0);
    expect(r.excessByCap[0].unitAmount).toBe(2000);
  });

  test("over per_night cap reports unit excess and total excess", () => {
    const r = evaluateReceiptAgainstPolicy(
      { receiptTypeId: 1, amount: 9000, nights: 3 }, // 3000/noche, cap 2500
      [cap({ capAmount: 2500, capUnit: "per_night" })],
      policy(),
    );
    expect(r.ok).toBe(false);
    expect(r.exceeded).toBe(true);
    const breach = r.excessByCap[0];
    expect(breach.unitAmount).toBe(3000);
    expect(breach.excess).toBe(500);
    expect(breach.excessTotal).toBe(1500); // 500 * 3 noches
  });

  test("per_trip ignores nights/days and compares total directly", () => {
    const r = evaluateReceiptAgainstPolicy(
      { receiptTypeId: 6, amount: 9500, nights: 5 }, // nights ignorado
      [cap({ capId: 200, receiptTypeId: 6, capAmount: 8000, capUnit: "per_trip" })],
      policy(),
    );
    expect(r.exceeded).toBe(true);
    expect(r.excessByCap[0].unitAmount).toBe(9500);
    expect(r.excessByCap[0].excess).toBe(1500);
    expect(r.excessByCap[0].excessTotal).toBe(1500);
  });

  test("per_day divides amount by days", () => {
    const r = evaluateReceiptAgainstPolicy(
      { receiptTypeId: 2, amount: 3200, days: 4 }, // 800/día, cap 800 → ok
      [cap({ capId: 300, receiptTypeId: 2, capAmount: 800, capUnit: "per_day" })],
      policy(),
    );
    expect(r.ok).toBe(true);
    expect(r.excessByCap[0].unitAmount).toBe(800);
    expect(r.excessByCap[0].excess).toBe(0);
  });

  test("per_event treats each receipt as one unit", () => {
    const r = evaluateReceiptAgainstPolicy(
      { receiptTypeId: 7, amount: 1200 },
      [cap({ capId: 400, receiptTypeId: 7, capAmount: 1000, capUnit: "per_event" })],
      policy(),
    );
    expect(r.exceeded).toBe(true);
    expect(r.excessByCap[0].excessTotal).toBe(200);
  });

  test("snapshot includes amount, currency and policyId", () => {
    const r = evaluateReceiptAgainstPolicy(
      { receiptTypeId: 1, amount: 2000, currency: "USD" },
      [cap()],
      policy(),
    );
    expect(r.snapshot.amount).toBe(2000);
    expect(r.snapshot.currency).toBe("USD");
    expect(r.snapshot.policyId).toBe(1);
  });
});

describe("refundRuleEngine.findApplicablePolicy", () => {
  const date = new Date("2026-06-15");

  test("returns null when no policies match", () => {
    expect(findApplicablePolicy([], { destinationScope: "nacional", evaluationDate: date })).toBeNull();
  });

  test("ignores inactive policies", () => {
    const p = policy({ active: false, categoryId: 1 });
    expect(findApplicablePolicy([p], { categoryId: 1, destinationScope: "nacional", evaluationDate: date })).toBeNull();
  });

  test("ignores policy with validTo before evaluation date", () => {
    const p = policy({ validFrom: new Date("2025-01-01"), validTo: new Date("2026-01-01") });
    expect(findApplicablePolicy([p], { destinationScope: "any", evaluationDate: date })).toBeNull();
  });

  test("includes policy with validTo=null when validFrom <= date", () => {
    const p = policy({ validFrom: new Date("2026-01-01"), validTo: null });
    const result = findApplicablePolicy([p], { destinationScope: "any", evaluationDate: date });
    expect(result).not.toBeNull();
    expect(result.policyId).toBe(1);
  });

  test("destinationScope='any' policy matches any requested scope", () => {
    const p = policy({ destinationScope: "any" });
    expect(findApplicablePolicy([p], { destinationScope: "internacional", evaluationDate: date })).not.toBeNull();
  });

  test("destinationScope mismatch is excluded", () => {
    const p = policy({ destinationScope: "nacional" });
    expect(findApplicablePolicy([p], { destinationScope: "internacional", evaluationDate: date })).toBeNull();
  });

  test("priority: category+CC > category > CC > catch-all", () => {
    const policies = [
      policy({ policyId: 1, categoryId: null, costsCenter: null }),                // catch-all = 1
      policy({ policyId: 2, categoryId: null, costsCenter: "CC001" }),             // CC only = 2
      policy({ policyId: 3, categoryId: 5,    costsCenter: null }),                // cat only = 3
      policy({ policyId: 4, categoryId: 5,    costsCenter: "CC001" }),             // both = 4
    ];
    const ctx = { categoryId: 5, destinationScope: "any", costsCenter: "CC001", evaluationDate: date };
    const winner = findApplicablePolicy(policies, ctx);
    expect(winner.policyId).toBe(4);
  });

  test("falls back from category-only to catch-all when CC differs", () => {
    const policies = [
      policy({ policyId: 1, categoryId: null, costsCenter: null }),
      policy({ policyId: 3, categoryId: 5,    costsCenter: null }),
    ];
    const winner = findApplicablePolicy(policies, {
      categoryId: 5, destinationScope: "any", costsCenter: "CC999", evaluationDate: date,
    });
    expect(winner.policyId).toBe(3);
  });

  test("ties on score break by most recent validFrom", () => {
    const policies = [
      policy({ policyId: 10, categoryId: 5, costsCenter: "CC1", validFrom: new Date("2026-01-01") }),
      policy({ policyId: 11, categoryId: 5, costsCenter: "CC1", validFrom: new Date("2026-03-01") }),
    ];
    const winner = findApplicablePolicy(policies, {
      categoryId: 5, destinationScope: "any", costsCenter: "CC1", evaluationDate: date,
    });
    expect(winner.policyId).toBe(11);
  });

  test("policy with categoryId set but ctx categoryId null does not match category", () => {
    const policies = [
      policy({ policyId: 50, categoryId: 5, costsCenter: null }),
      policy({ policyId: 60, categoryId: null, costsCenter: null }),
    ];
    const winner = findApplicablePolicy(policies, { destinationScope: "any", evaluationDate: date });
    expect(winner.policyId).toBe(60); // cat-only excluded, catch-all wins
  });
});

describe("refundRuleEngine.summarizeRequestPolicyResult", () => {
  test("sums claimed/allowed/excess across receipts", () => {
    const receipts = [
      { receiptId: 1, receiptTypeId: 1, amount: 5000, nights: 2 }, // 2500/noche, cap 2500 → ok
      { receiptId: 2, receiptTypeId: 1, amount: 6000, nights: 2 }, // 3000/noche → excess 500/noche * 2 = 1000
    ];
    const caps = [cap({ capAmount: 2500, capUnit: "per_night" })];
    const summary = summarizeRequestPolicyResult(receipts, caps, policy());
    expect(summary.totalClaimed).toBe(11000);
    expect(summary.totalExcess).toBe(1000);
    expect(summary.totalAllowed).toBe(10000);
  });

  test("approved exception receipt counts as fully allowed", () => {
    const receipts = [
      { receiptId: 1, receiptTypeId: 1, amount: 6000, nights: 2 }, // would normally excess 1000
    ];
    const caps = [cap({ capAmount: 2500, capUnit: "per_night" })];
    const summary = summarizeRequestPolicyResult(receipts, caps, policy(), {
      approvedExceptionReceiptIds: [1],
    });
    expect(summary.totalAllowed).toBe(6000);
    expect(summary.totalExcess).toBe(0);
    expect(summary.perReceipt[0].hadExceptionApproved).toBe(true);
  });

  test("returns currency from policy", () => {
    const summary = summarizeRequestPolicyResult([], [], policy({ currency: "USD" }));
    expect(summary.currency).toBe("USD");
  });

  test("with null policy and no caps, allowed equals claimed", () => {
    const receipts = [{ receiptId: 1, receiptTypeId: 1, amount: 1234 }];
    const summary = summarizeRequestPolicyResult(receipts, [], null);
    expect(summary.totalClaimed).toBe(1234);
    expect(summary.totalAllowed).toBe(1234);
    expect(summary.totalExcess).toBe(0);
  });
});

describe("refundRuleEngine.buildPolicyEvaluationSnapshot", () => {
  test("returns null when policy is null", () => {
    expect(buildPolicyEvaluationSnapshot(null, [], { requestId: 1 })).toBeNull();
  });

  test("freezes policy fields and caps relevant to the policy", () => {
    const caps = [
      cap({ capId: 100, policyId: 1, capAmount: 2500, capUnit: "per_night" }),
      cap({ capId: 200, policyId: 1, capAmount: 800,  capUnit: "per_day", receiptTypeId: 2 }),
      cap({ capId: 300, policyId: 999, capAmount: 1, capUnit: "per_trip" }), // de otra policy → ignorada
    ];
    const snap = buildPolicyEvaluationSnapshot(policy({ name: "Base 2026" }), caps, { requestId: 42 });
    expect(snap.policyId).toBe(1);
    expect(snap.name).toBe("Base 2026");
    expect(snap.requestId).toBe(42);
    expect(snap.caps).toHaveLength(2);
    expect(snap.caps.map((c) => c.capId).sort()).toEqual([100, 200]);
    expect(snap.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("snapshot dailyPerDiem normalizes Decimal-like values to number", () => {
    const fakeDecimal = { toNumber: () => 1500 };
    const snap = buildPolicyEvaluationSnapshot(policy({ dailyPerDiem: fakeDecimal }), [], {});
    expect(snap.dailyPerDiem).toBe(1500);
  });
});
