/**
 * @file tests/middleware/apiKeyAuth.test.js
 * @description Unit tests for API key header extraction and error types.
 */
import { jest } from "@jest/globals";

const { extractApiKeyFromRequest } = await import("../../middleware/apiKeyAuth.js");
const { InvalidApiKeyError } = await import("../../middleware/authErrors.js");

describe("extractApiKeyFromRequest", () => {
  test("reads X-API-Key header", () => {
    const req = { headers: { "x-api-key": "  cck_abc  " } };
    expect(extractApiKeyFromRequest(req)).toBe("cck_abc");
  });

  test("reads Authorization Bearer token", () => {
    const req = { headers: { authorization: "Bearer cck_token" } };
    expect(extractApiKeyFromRequest(req)).toBe("cck_token");
  });

  test("returns null when missing", () => {
    const req = { headers: {} };
    expect(extractApiKeyFromRequest(req)).toBeNull();
  });
});

describe("InvalidApiKeyError", () => {
  test("uses HTTP 401", () => {
    const err = new InvalidApiKeyError();
    expect(err.statusCode).toBe(401);
    expect(err.error).toBe("INVALID_API_KEY");
  });
});
