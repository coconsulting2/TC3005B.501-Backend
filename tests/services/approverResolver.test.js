import { describe, expect, test } from "@jest/globals";
import { resolveN1N2Approvers } from "../../services/approverResolver.js";

describe("resolveN1N2Approvers", () => {
  test("sin organizationId devuelve approverIds vacío", async () => {
    const db = {};
    const result = await resolveN1N2Approvers(db, null, 1, 99);
    expect(result).toEqual({ n1UserId: null, n2UserId: null, approverIds: [] });
  });
});
