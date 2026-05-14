/**
 * Grupos de permiso que todo rol operativo debería enlazar para coherencia con BD/UI
 * (además de la unión implícita en `loadEffectivePermissions`; ver CocoAPI_flujos §7.15).
 * Llamar desde futuras rutas `POST /admin/roles` o clonación de rol.
 */

/** @type {ReadonlyArray<string>} */
export const APPLICANT_DEFAULT_GROUP_NAMES = Object.freeze(["BaseColaborador", "TravelRequestAuthor"]);

/**
 * Idempotente: enlaza `BaseColaborador` y `TravelRequestAuthor` de la org al rol si existen.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {bigint|number|string} organizationId
 * @param {number} roleId
 * @returns {Promise<{ linkedGroupIds: number[] }>}
 */
export async function ensureApplicantGroupsForRole(prisma, organizationId, roleId) {
  const orgIdBig = BigInt(organizationId);
  const groups = await prisma.permissionGroup.findMany({
    where: {
      organizationId: orgIdBig,
      groupName: { in: [...APPLICANT_DEFAULT_GROUP_NAMES] },
      active: true,
    },
    select: { groupId: true },
  });
  const data = groups.map((g) => ({ roleId, groupId: g.groupId }));
  if (data.length > 0) {
    await prisma.rolePermissionGroup.createMany({ data, skipDuplicates: true });
  }
  return { linkedGroupIds: groups.map((g) => g.groupId) };
}
