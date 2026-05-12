import prisma from "../database/config/prisma.js";

const ViaticasPolicy = {
  /**
   * Returns the viaticos policy for an organization, or null if none exists.
   * @param {bigint | number} organizationId
   * @returns {Promise<Object | null>}
   */
  async getByOrg(organizationId) {
    const row = await prisma.viaticosPolicy.findUnique({
      where: { organizationId: BigInt(organizationId) },
    });
    if (!row) return null;
    return {
      id: row.id,
      org_id: row.organizationId.toString(),
      max_hotel: Number(row.maxHotel),
      max_meal: Number(row.maxMeal),
      currency: row.currency,
      active: row.active,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  },

  /**
   * Creates or updates the viaticos policy for an organization.
   * @param {bigint | number} organizationId
   * @param {{ maxHotel: number, maxMeal: number, currency?: string, active?: boolean }} payload
   * @returns {Promise<Object>}
   */
  async upsert(organizationId, payload) {
    const data = {
      maxHotel: payload.maxHotel,
      maxMeal: payload.maxMeal,
      currency: payload.currency ?? "MXN",
      active: payload.active ?? true,
    };
    const row = await prisma.viaticosPolicy.upsert({
      where: { organizationId: BigInt(organizationId) },
      update: data,
      create: { organizationId: BigInt(organizationId), ...data },
    });
    return {
      id: row.id,
      org_id: row.organizationId.toString(),
      max_hotel: Number(row.maxHotel),
      max_meal: Number(row.maxMeal),
      currency: row.currency,
      active: row.active,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  },
};

export default ViaticasPolicy;
