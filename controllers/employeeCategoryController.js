/**
 * @module employeeCategoryController
 * @description CRUD endpoints para EmployeeCategory (M2-006).
 */
import prisma from "../database/config/prisma.js";
import * as svc from "../services/employeeCategoryService.js";

async function resolveOrgId(req) {
  const userId = Number(req.user.user_id);
  const user = await prisma.user.findUnique({ where: { userId }, select: { orgId: true } });
  if (!user || user.orgId === null) {
    const err = new Error("Usuario sin organización asignada.");
    err.status = 403;
    throw err;
  }
  return user.orgId;
}

function handleError(res, error, label) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error(`${label}:`, error);
  return res.status(500).json({ error: "Internal server error" });
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const list = async (req, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const rows = await svc.listCategories(orgId, { activeOnly: req.query.activeOnly !== "false" });
    return res.status(200).json({ categories: rows });
  } catch (e) { return handleError(res, e, "category.list"); }
};

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const create = async (req, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const created = await svc.createCategory(orgId, req.body);
    return res.status(201).json(created);
  } catch (e) { return handleError(res, e, "category.create"); }
};

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const update = async (req, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const updated = await svc.updateCategory(Number(req.params.id), orgId, req.body);
    return res.status(200).json(updated);
  } catch (e) { return handleError(res, e, "category.update"); }
};

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const deactivate = async (req, res) => {
  try {
    const orgId = await resolveOrgId(req);
    await svc.deactivateCategory(Number(req.params.id), orgId);
    return res.status(204).send();
  } catch (e) { return handleError(res, e, "category.deactivate"); }
};
