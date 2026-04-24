/**
 * @module approverResolver
 * @description Resuelve usuarios N1 / N2 por organización (y preferencia mismo departamento).
 */
import prisma from "../database/config/prisma.js";

const N1_NAME = "N1";
const N2_NAME = "N2";

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} db
 * @param {bigint | null | undefined} orgId
 * @param {number | null | undefined} departmentId
 * @returns {Promise<{ n1UserId: number | null, n2UserId: number | null }>}
 */
export async function resolveN1N2Approvers(db, orgId, departmentId) {
  if (orgId === null || orgId === undefined) {
    return { n1UserId: null, n2UserId: null };
  }

  const org = BigInt(orgId);
  const dept = departmentId != null ? Number(departmentId) : null;

  const findOne = async (roleName, preferDept) => {
    const base = {
      orgId: org,
      active: true,
      role: { roleName },
    };
    if (preferDept != null) {
      const u = await db.user.findFirst({
        where: { ...base, departmentId: preferDept },
        select: { userId: true },
      });
      if (u) return u.userId;
    }
    const u2 = await db.user.findFirst({
      where: base,
      select: { userId: true },
      orderBy: { userId: "asc" },
    });
    return u2 ? u2.userId : null;
  };

  const [n1UserId, n2UserId] = await Promise.all([
    findOne(N1_NAME, dept),
    findOne(N2_NAME, dept),
  ]);

  return { n1UserId, n2UserId };
}

/**
 * Resolución usando cliente global (tests / utilidades).
 * @param {bigint | null | undefined} orgId
 * @param {number | null | undefined} departmentId
 */
export async function resolveN1N2ApproversGlobal(orgId, departmentId) {
  return resolveN1N2Approvers(prisma, orgId, departmentId);
}
