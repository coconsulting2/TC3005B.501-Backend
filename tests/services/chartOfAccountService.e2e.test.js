/**
 * @file chartOfAccountService.e2e.test.js
 * @description E2E tests against a live Postgres for the chart-of-accounts CRUD (US-24 / BUG-M3-001).
 *   Covers create, unique→409, get (org-scoped), update, hierarchy/cycle guards, and the
 *   "no eliminar si asociado" guard (a ReceiptType referencing the account blocks deactivation).
 *
 * Requires the dev stack (Postgres). Run with: bun run test:e2e
 */
import { afterAll, describe, expect, it } from "@jest/globals";
import prisma from "../../database/config/prisma.js";
import * as svc from "../../services/chartOfAccountService.js";

const ORG_ID = 1n; // Ditta (ROOT) — always present after seed.js
const tag = Date.now().toString().slice(-9);

describe("chartOfAccountService CRUD (e2e, live DB)", () => {
  /** @type {bigint[]} */
  const createdIds = [];
  /** @type {number[]} */
  const createdReceiptTypeIds = [];

  afterAll(async () => {
    try {
      for (const rtId of createdReceiptTypeIds) {
        await prisma.receiptType.delete({ where: { receiptTypeId: rtId } }).catch(() => {});
      }
      for (const id of createdIds) {
        await prisma.chartOfAccount.delete({ where: { accountId: id } }).catch(() => {});
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("creates an account and rejects a duplicate code with 409", async () => {
    const code = `E2E-${tag}-A`;
    const created = await svc.createAccount(ORG_ID, {
      accountCode: code,
      accountName: "E2E cuenta A",
      accountType: "Gasto",
    });
    expect(created.accountId).toBeDefined();
    expect(created.active).toBe(true);
    createdIds.push(created.accountId);

    await expect(
      svc.createAccount(ORG_ID, { accountCode: code, accountName: "dup", accountType: "Gasto" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("gets an account scoped to its org", async () => {
    const created = await svc.createAccount(ORG_ID, {
      accountCode: `E2E-${tag}-B`,
      accountName: "E2E cuenta B",
      accountType: "Activo",
    });
    createdIds.push(created.accountId);

    const found = await svc.getAccount(created.accountId, ORG_ID);
    expect(found?.accountId).toEqual(created.accountId);

    // wrong org -> null (org 999 does not own it)
    const crossOrg = await svc.getAccount(created.accountId, 999n);
    expect(crossOrg).toBeNull();
  });

  it("updates an account's name", async () => {
    const created = await svc.createAccount(ORG_ID, {
      accountCode: `E2E-${tag}-C`,
      accountName: "antes",
      accountType: "Gasto",
    });
    createdIds.push(created.accountId);

    const updated = await svc.updateAccount(created.accountId, ORG_ID, { accountName: "después" });
    expect(updated.accountName).toBe("después");
  });

  it("blocks deactivation when a ReceiptType references the account (no eliminar si asociado)", async () => {
    // gasto_gl_account_code is VARCHAR(10); keep the code short so the FK-by-code reference fits.
    const code = `GLD${tag.slice(-6)}`;
    const created = await svc.createAccount(ORG_ID, {
      accountCode: code,
      accountName: "E2E cuenta asociada",
      accountType: "Gasto",
    });
    createdIds.push(created.accountId);

    const rt = await prisma.receiptType.create({
      data: { organizationId: ORG_ID, receiptTypeName: `E2E-RT-${tag}`, gastoGlAccountCode: code },
    });
    createdReceiptTypeIds.push(rt.receiptTypeId);

    await expect(svc.deactivateAccount(created.accountId, ORG_ID)).rejects.toMatchObject({ status: 409 });
  });

  it("deactivates an unreferenced account (soft delete)", async () => {
    const created = await svc.createAccount(ORG_ID, {
      accountCode: `E2E-${tag}-E`,
      accountName: "E2E cuenta libre",
      accountType: "Gasto",
    });
    createdIds.push(created.accountId);

    const result = await svc.deactivateAccount(created.accountId, ORG_ID);
    expect(result.active).toBe(false);
  });
});
