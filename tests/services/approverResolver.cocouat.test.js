/**
 * @file approverResolver.cocouat.test.js
 * @description Unit regression guard for BUG-M2-003.
 *
 * BUG-M2-003 reported that N1 (santino.im) got a 400 approving angel.montemayor's request,
 * suggesting approverResolver picked the wrong N1. Empirical diagnosis against the CocoUAT seed
 * showed the resolver is CORRECT: it derives N1 from the applicant's manager chain
 * (angel → santino → kevin). The M2-QA2 400 came from a stale Postman `n1_user_id`, not this code.
 *
 * This test models the CocoUAT organigram with a mocked db so it runs in the unit job (no seed/DB
 * dependency) and pins the correct behaviour.
 */
import { describe, expect, it } from "@jest/globals";
import { resolveN1N2Approvers } from "../../services/approverResolver.js";

// CocoUAT organigram: angel(9) → santino(7, N1) → kevin(6, N2). leonardo(8) is the OTHER N1.
const MANAGER_OF = { 9: 7, 7: 6, 6: null };

describe("approverResolver — N1/N2 resolution (BUG-M2-003 regression)", () => {
  it("resolves N1 to the applicant's direct manager and N2 to the next level up", async () => {
    const db = {
      user: {
        findUnique: async ({ where: { userId } }) => ({ managerUserId: MANAGER_OF[userId] ?? null }),
        // role-based fallback is not exercised while the manager chain is intact
        findFirst: async () => null,
      },
    };

    const res = await resolveN1N2Approvers(db, 101n, 7, 9);

    // N1 must be santino (angel's direct manager), NOT leonardo (the other N1 in the org).
    expect(res.n1UserId).toBe(7);
    expect(res.n2UserId).toBe(6);
    expect(res.approverIds).toEqual([7, 6]);
  });

  it("falls back to the lowest-id role holder when the applicant has no manager chain", async () => {
    const db = {
      user: {
        findUnique: async () => ({ managerUserId: null }),
        findFirst: async ({ where }) => (where.role.roleName === "N1" ? { userId: 7 } : { userId: 6 }),
      },
    };

    const res = await resolveN1N2Approvers(db, 101n, 7, 9);

    expect(res.n1UserId).toBe(7);
    expect(res.n2UserId).toBe(6);
    expect(res.approverIds).toEqual([7, 6]);
  });
});
