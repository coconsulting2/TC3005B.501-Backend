/**
 * @file tests/services/alertMessageResolver.test.js
 */
import { describe, test, expect } from "@jest/globals";
import { REQUEST_STATUS_ALERT_TEXT } from "../../services/alertMessageResolver.js";

describe("alertMessageResolver", () => {
  test("REQUEST_STATUS_ALERT_TEXT cubre estados 1–7 del flujo", () => {
    expect(Object.keys(REQUEST_STATUS_ALERT_TEXT).map(Number).sort()).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(REQUEST_STATUS_ALERT_TEXT[2]).toContain("Primera Revisión");
  });
});
