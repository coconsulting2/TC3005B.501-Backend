/**
 * @module employeeCategoryService
 * @description CRUD de categorías de empleado para políticas de viáticos (M2-006 RF-42).
 *   Las categorías son ortogonales a Role (RBAC) y se usan en TravelPolicy.categoryId.
 */
import prisma from "../database/config/prisma.js";

/**
 * Lists categories for an organization. By default returns only active rows.
 * @param {bigint | number} organizationId
 * @param {{ activeOnly?: boolean }} [opts]
 * @returns {Promise<Array>}
 */
export async function listCategories(organizationId, opts = {}) {
  const where = { organizationId };
  if (opts.activeOnly !== false) where.active = true;
  return prisma.employeeCategory.findMany({
    where,
    orderBy: [{ name: "asc" }],
  });
}

/**
 * Reads one category by id (scoped to org).
 * @param {number} categoryId
 * @param {bigint | number} organizationId
 * @returns {Promise<Object | null>}
 */
export async function getCategory(categoryId, organizationId) {
  const row = await prisma.employeeCategory.findUnique({ where: { categoryId: Number(categoryId) } });
  if (!row || String(row.organizationId) !== String(organizationId)) return null;
  return row;
}

/**
 * Creates a new category. Maps unique-violation to status 409.
 * @param {bigint | number} organizationId
 * @param {{ code: string, name: string, description?: string }} payload
 * @returns {Promise<Object>}
 */
export async function createCategory(organizationId, payload) {
  try {
    return await prisma.employeeCategory.create({
      data: {
        organizationId,
        code: String(payload.code).trim(),
        name: String(payload.name).trim(),
        description: payload.description ? String(payload.description).trim() : null,
        active: true,
      },
    });
  } catch (err) {
    if (err.code === "P2002") {
      const e = new Error(`Categoría con code "${payload.code}" ya existe en esta organización.`);
      e.status = 409;
      throw e;
    }
    throw err;
  }
}

/**
 * Updates a category. Org-scoped.
 * @param {number} categoryId
 * @param {bigint | number} organizationId
 * @param {{ name?: string, description?: string, active?: boolean }} payload
 * @returns {Promise<Object>}
 */
export async function updateCategory(categoryId, organizationId, payload) {
  const existing = await getCategory(categoryId, organizationId);
  if (!existing) {
    const err = new Error(`Categoría ${categoryId} no encontrada.`);
    err.status = 404;
    throw err;
  }
  const data = {};
  if (payload.name !== undefined)        data.name = String(payload.name).trim();
  if (payload.description !== undefined) data.description = payload.description ? String(payload.description).trim() : null;
  if (payload.active !== undefined)      data.active = Boolean(payload.active);

  return prisma.employeeCategory.update({
    where: { categoryId: Number(categoryId) },
    data,
  });
}

/**
 * Soft-deletes a category (active=false). Org-scoped.
 * @param {number} categoryId
 * @param {bigint | number} organizationId
 * @returns {Promise<Object>}
 */
export async function deactivateCategory(categoryId, organizationId) {
  const existing = await getCategory(categoryId, organizationId);
  if (!existing) {
    const err = new Error(`Categoría ${categoryId} no encontrada.`);
    err.status = 404;
    throw err;
  }
  return prisma.employeeCategory.update({
    where: { categoryId: Number(categoryId) },
    data: { active: false },
  });
}
