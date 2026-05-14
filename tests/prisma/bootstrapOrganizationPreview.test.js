/**
 * @file tests/prisma/bootstrapOrganizationPreview.test.js
 * @description Vista previa de permisos al importar / crear org (sin BD).
 */
import { describe, test, expect } from "@jest/globals";
import { TENANT_APPLICANT_CAPABILITY_CODES } from "../../config/tenantApplicantCapability.js";
import { getDefaultRolePreviewPermissionCodes } from "../../prisma/seedHelpers/bootstrapOrganization.js";

describe("getDefaultRolePreviewPermissionCodes", () => {
  test("cada rol default incluye la capacidad solicitante del tenant", () => {
    for (const roleName of [
      "Solicitante",
      "N1",
      "Observador",
      "Administrador",
      "Agencia de viajes",
      "Cuentas por pagar",
    ]) {
      const codes = getDefaultRolePreviewPermissionCodes(roleName);
      for (const c of TENANT_APPLICANT_CAPABILITY_CODES) {
        expect(codes).toContain(c);
      }
      expect(codes).toEqual([...codes].sort((a, b) => a.localeCompare(b)));
    }
  });
});
