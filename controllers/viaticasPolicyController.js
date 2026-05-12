import prisma from "../database/config/prisma.js";
import ViaticasPolicy from "../models/viaticasPolicyModel.js";
import { body, validationResult } from "express-validator";

async function resolveOrgId(req) {
  const userId = Number(req.user.user_id);
  const user = await prisma.user.findUnique({ where: { userId }, select: { organizationId: true } });
  if (!user?.organizationId) {
    const err = new Error("Usuario sin organización asignada.");
    err.status = 403;
    throw err;
  }
  return user.organizationId;
}

export const validatePolicyPayload = [
  body("max_hotel")
    .notEmpty().withMessage("max_hotel is required")
    .isFloat({ min: 0 }).withMessage("max_hotel must be a non-negative number")
    .toFloat(),
  body("max_meal")
    .notEmpty().withMessage("max_meal is required")
    .isFloat({ min: 0 }).withMessage("max_meal must be a non-negative number")
    .toFloat(),
  body("currency")
    .optional()
    .isString()
    .isLength({ min: 3, max: 3 }).withMessage("currency must be a 3-character code")
    .toUpperCase(),
  body("active")
    .optional()
    .isBoolean().withMessage("active must be a boolean")
    .toBoolean(),
];

/**
 * Returns the viaticos policy for the authenticated user's organization.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const getPolicy = async (req, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const policy = await ViaticasPolicy.getByOrg(orgId);
    if (!policy) return res.status(404).json({ error: "No viaticos policy configured for this organization" });
    return res.status(200).json(policy);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error("Error in getPolicy:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Creates or updates the viaticos policy for the authenticated user's organization.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const upsertPolicy = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const orgId = await resolveOrgId(req);
    const { max_hotel, max_meal, currency, active } = req.body;
    const policy = await ViaticasPolicy.upsert(orgId, {
      maxHotel: max_hotel,
      maxMeal: max_meal,
      currency,
      active,
    });
    return res.status(200).json(policy);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error("Error in upsertPolicy:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
