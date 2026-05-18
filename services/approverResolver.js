/**
 * @module approverResolver
 * @description Resuelve usuarios N1 / N2 por organización (y preferencia mismo departamento).
 */
import prisma from "../database/config/prisma.js";

const N1_NAME = "N1";
const N2_NAME = "N2";

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} db
 * @param {bigint | null | undefined} organizationId
 * @param {number | null | undefined} departmentId
 * @param {number | null | undefined} userId
 * @returns {Promise<{ n1UserId: number | null, n2UserId: number | null, approverIds: (number|null)[] }>}
 */
export async function resolveN1N2Approvers(db, organizationId, departmentId, userId) {
  if (organizationId === null || organizationId === undefined) {
    return { n1UserId: null, n2UserId: null, approverIds: [] };
  }

  const org = BigInt(organizationId);
  const dept = departmentId != null ? Number(departmentId) : null;

  const findOne = async (roleName, preferDept) => {
    const base = {
      organizationId: org,
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

  const approverIds = [];
  if (userId) {
    let currentUserId = Number(userId);
    for (let i = 0; i < 10; i++) { // Limit to 10 levels of hierarchy to avoid infinite loops
      const currentUser = await db.user.findUnique({
        where: { userId: currentUserId },
        select: { managerUserId: true }
      });
      if (currentUser && currentUser.managerUserId) {
        approverIds.push(currentUser.managerUserId);
        currentUserId = currentUser.managerUserId;
      } else {
        break;
      }
    }
  }

  const [fallbackN1, fallbackN2] = await Promise.all([
    findOne(N1_NAME, dept),
    findOne(N2_NAME, dept),
  ]);

  const n1UserId = approverIds[0] || fallbackN1;
  const n2UserId = approverIds[1] || fallbackN2;

  // Ensure approverIds has at least the fallbacks if hierarchy is missing
  if (approverIds.length === 0) {
    if (n1UserId) approverIds.push(n1UserId);
    if (n2UserId) approverIds.push(n2UserId);
  } else if (approverIds.length === 1) {
    if (n2UserId) approverIds.push(n2UserId);
  }

  return { n1UserId, n2UserId, approverIds };
}

/**
 * Resolución usando cliente global (tests / utilidades).
 * @param {bigint | null | undefined} organizationId
 * @param {number | null | undefined} departmentId
 * @param {number | null | undefined} userId
 */
export async function resolveN1N2ApproversGlobal(organizationId, departmentId, userId) {
  return resolveN1N2Approvers(prisma, organizationId, departmentId, userId);
}
