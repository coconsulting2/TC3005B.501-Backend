/**
 * @module policyController
 * @description Endpoints CRUD para políticas de viáticos + preview de excedente (M2-006).
 */
import prisma from "../database/config/prisma.js";
import * as policyService from "../services/policyService.js";
import * as policyAlertService from "../services/policyAlertService.js";

async function resolveOrgId(req) {
  const userId = Number(req.user.user_id);
  const user = await prisma.user.findUnique({ where: { userId }, select: { orgId: true } });
  if (!user || user.orgId === null || user.orgId === undefined) {
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
 * GET /api/policies?activeOnly=&categoryId=&asOfDate=
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const listPolicies = async (req, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const filters = {
      activeOnly: req.query.activeOnly !== "false",
      categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
      asOfDate: req.query.asOfDate || undefined,
    };
    const rows = await policyService.listPolicies(orgId, filters);
    return res.status(200).json({ policies: rows });
  } catch (e) { return handleError(res, e, "policy.list"); }
};

/**
 * GET /api/policies/:id
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const getPolicy = async (req, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const row = await policyService.getPolicy(Number(req.params.id), orgId);
    if (!row) return res.status(404).json({ error: "Política no encontrada." });
    return res.status(200).json(row);
  } catch (e) { return handleError(res, e, "policy.get"); }
};

/**
 * POST /api/policies
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const createPolicy = async (req, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const created = await policyService.createPolicy(orgId, req.body);
    return res.status(201).json(created);
  } catch (e) { return handleError(res, e, "policy.create"); }
};

/**
 * PUT /api/policies/:id
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const updatePolicy = async (req, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const updated = await policyService.updatePolicy(Number(req.params.id), orgId, req.body);
    return res.status(200).json(updated);
  } catch (e) { return handleError(res, e, "policy.update"); }
};

/**
 * DELETE /api/policies/:id  (soft)
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const deactivatePolicy = async (req, res) => {
  try {
    const orgId = await resolveOrgId(req);
    await policyService.deactivatePolicy(Number(req.params.id), orgId);
    return res.status(204).send();
  } catch (e) { return handleError(res, e, "policy.deactivate"); }
};

/**
 * POST /api/policies/preview  body: { requestId, receiptTypeId, amount, currency?, nights?, days? }
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const previewReceipt = async (req, res) => {
  try {
    const result = await policyAlertService.checkReceiptBeforeSubmit(req.body);
    return res.status(200).json(result);
  } catch (e) { return handleError(res, e, "policy.preview"); }
};
