/**
 * @file organizationService.e2e.test.js
 * @description E2E regression test against a live Postgres for organization creation.
 *
 * Regression guard for the org-create-500 bug (TI-001 F1): createOrganization ran its
 * bootstrap inside withRls(... bypass ...) but passed the GLOBAL prisma client (instead of
 * the transaction client `tx`) to bootstrapOrganizationCatalogs / ensureOrganizationAdmin.
 * The role write and the role read then happened on different connections, so the GUC-scoped
 * read could not see the just-written roles → "Role 'Administrador' not found for org N" → 500.
 * The fix passes `tx` through the bootstrap chain. This test verifies a CLIENT org is created
 * with its bootstrapped roles AND its initial admin user.
 *
 * Requires the dev stack (Postgres). Run with: bun run test:e2e (or the e2e jest invocation).
 */
import { afterAll, describe, expect, it } from "@jest/globals";
import prisma from "../../database/config/prisma.js";
import { createOrganization } from "../../services/organizationService.js";

describe("organizationService.createOrganization (e2e, live DB)", () => {
  /** @type {bigint[]} ids of orgs created by this suite, for cleanup */
  const createdOrgIds = [];

  afterAll(async () => {
    for (const orgId of createdOrgIds) {
      try {
        await prisma.$transaction([
          prisma.user.deleteMany({ where: { organizationId: orgId } }),
          prisma.role.deleteMany({ where: { organizationId: orgId } }),
          prisma.organization.delete({ where: { id: orgId } }),
        ]);
      } catch {
        // best-effort cleanup; bootstrapped catalogs may hold FKs in some schemas
      }
    }
    await prisma.$disconnect();
  });

  it("creates a CLIENT org with bootstrapped roles and its initial admin", async () => {
    const stamp = Date.now().toString().slice(-9);
    const email = `e2e.orgcreate.${stamp}@example.test`;

    const res = await createOrganization({
      nombre: `E2E-OrgCreate-${stamp}`,
      rfc: `TIM${stamp.slice(-6)}AB1`,
      adminEmail: email,
      adminNombre: "E2E Admin",
      adminPassword: "E2eOrg!2026#x",
    });

    expect(res.organization).toBeTruthy();
    expect(res.organization.kind).toBe("CLIENT");
    expect(res.organization.status).toBe("CONFIGURING");

    const orgId = BigInt(res.organization.id);
    createdOrgIds.push(orgId);

    // The F1 bug surfaced exactly here: roles were written but not visible on the read
    // connection, so the bootstrap threw before any role existed for the org.
    const roleCount = await prisma.role.count({ where: { organizationId: orgId } });
    expect(roleCount).toBeGreaterThanOrEqual(7);

    const admin = await prisma.user.findFirst({ where: { organizationId: orgId, email } });
    expect(admin).toBeTruthy();
  });
});
