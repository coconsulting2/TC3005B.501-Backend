/**
 * Persiste en `User_Permission` los códigos de la capacidad solicitante del tenant.
 * Idempotente (`skipDuplicates`). Complementa el merge en runtime de `permissionService`.
 */
import prisma from "../database/config/prisma.js";
import { TENANT_APPLICANT_CAPABILITY_CODES } from "../config/tenantApplicantCapability.js";

/**
 * @param {bigint|number|string} organizationId
 * @param {number} userId
 * @returns {Promise<void>}
 */
export async function ensureTenantApplicantUserPermissions(organizationId, userId) {
  const orgIdBig =
    typeof organizationId === "bigint" ? organizationId : BigInt(String(organizationId));
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return;
  if (orgIdBig === 0n) return;

  const codes = [...TENANT_APPLICANT_CAPABILITY_CODES];
  const perms = await prisma.permission.findMany({
    where: { code: { in: codes }, active: true },
    select: { permissionId: true },
  });
  if (perms.length === 0) return;

  await prisma.userPermission.createMany({
    data: perms.map((p) => ({
      userId: uid,
      permissionId: p.permissionId,
      organizationId: orgIdBig,
    })),
    skipDuplicates: true,
  });
}
