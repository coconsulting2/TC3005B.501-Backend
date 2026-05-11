/**
 * @module routes/organizationRoutes
 * @description /api/organizations — gestión de tenants. Ditta only crea/lista.
 */
import express from "express";
import {
  postOrganization,
  getOrganizations,
  getOrganizationMe,
  getOrganizationById,
  patchOrganization,
  postActivate,
  postSuspend,
} from "../controllers/organizationController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.use(generalRateLimiter);

router.get("/me", requireAnyPermission("user:view_self"), getOrganizationMe);

router.post("/", requirePermission("organization:create"), postOrganization);
router.get("/", requirePermission("organization:list_all"), getOrganizations);

router.get("/:id", requirePermission("organization:read"), getOrganizationById);
router.patch("/:id", requirePermission("organization:update"), patchOrganization);

router.post("/:id/activate", requirePermission("organization:activate"), postActivate);
router.post("/:id/suspend", requirePermission("organization:suspend"), postSuspend);

export default router;
