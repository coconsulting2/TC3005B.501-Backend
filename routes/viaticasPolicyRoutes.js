import express from "express";
import { getPolicy, upsertPolicy, validatePolicyPayload } from "../controllers/viaticasPolicyController.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.get("/", generalRateLimiter, ...requirePermission("policy:read"), getPolicy);
router.put("/", generalRateLimiter, ...requirePermission("policy:manage"), validatePolicyPayload, upsertPolicy);

export default router;
