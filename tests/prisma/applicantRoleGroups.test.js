/**
 * @file tests/prisma/applicantRoleGroups.test.js
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

import { ensureApplicantGroupsForRole } from "../../prisma/seedHelpers/applicantRoleGroups.js";

describe("ensureApplicantGroupsForRole", () => {
  const createMany = jest.fn().mockResolvedValue({ count: 2 });

  beforeEach(() => {
    createMany.mockClear();
  });

  test("createMany idempotente con grupos encontrados", async () => {
    const prisma = {
      permissionGroup: {
        findMany: jest.fn().mockResolvedValue([{ groupId: 1 }, { groupId: 2 }]),
      },
      rolePermissionGroup: { createMany },
    };
    const r = await ensureApplicantGroupsForRole(prisma, 101n, 7);
    expect(prisma.permissionGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 101n,
          groupName: { in: ["BaseColaborador", "TravelRequestAuthor"] },
        }),
      }),
    );
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { roleId: 7, groupId: 1 },
        { roleId: 7, groupId: 2 },
      ],
      skipDuplicates: true,
    });
    expect(r.linkedGroupIds).toEqual([1, 2]);
  });

  test("sin grupos no llama createMany", async () => {
    const prisma = {
      permissionGroup: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      rolePermissionGroup: { createMany },
    };
    await ensureApplicantGroupsForRole(prisma, 5, 3);
    expect(createMany).not.toHaveBeenCalled();
  });
});
