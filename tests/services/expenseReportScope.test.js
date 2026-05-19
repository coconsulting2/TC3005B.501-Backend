/**
 * @file tests/services/expenseReportScope.test.js
 */
import { describe, test, expect } from "@jest/globals";
import {
  canViewOrganizationExpenseReport,
  resolveExpenseReportVisibleUserIds,
} from "../../services/expenseReportService.js";

describe("expenseReportService — alcance por jerarquía", () => {
  test("CxP y admin ven toda la organización", () => {
    expect(
      canViewOrganizationExpenseReport(
        new Set(["expense:view", "travel_request:authorize"]),
      ),
    ).toBe(true);
    expect(
      canViewOrganizationExpenseReport(new Set(["travel_request:view_any"])),
    ).toBe(true);
    expect(canViewOrganizationExpenseReport(new Set(["policy:manage"]))).toBe(
      true,
    );
  });

  test("N1/N2 con solo authorize no tienen alcance organizacional", () => {
    expect(
      canViewOrganizationExpenseReport(
        new Set(["travel_request:authorize"]),
      ),
    ).toBe(false);
  });

  test("solicitante sin permisos amplios solo ve sus propios comprobantes", async () => {
    const ids = await resolveExpenseReportVisibleUserIds(
      99,
      new Set(["travel_request:view_own"]),
    );
    expect(ids).toEqual([99]);
  });

  test("alcance organizacional devuelve null (sin filtro de usuarios)", async () => {
    const ids = await resolveExpenseReportVisibleUserIds(
      10,
      new Set(["expense:view"]),
    );
    expect(ids).toBeNull();
  });
});
