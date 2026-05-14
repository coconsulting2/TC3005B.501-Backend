import express from "express";
import { generalRateLimiter } from "../middleware/rateLimiters.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { postHotelSearch, validateHotelSearch } from "../controllers/hotelsController.js";
import { validationResult } from "express-validator";

const router = express.Router();

router.post(
  "/search",
  generalRateLimiter,
  ...requirePermission("travel_agent:attend"),
  ...validateHotelSearch,
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    return postHotelSearch(req, res, next);
  }
);

export default router;
