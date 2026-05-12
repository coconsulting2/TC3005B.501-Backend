import express from "express";
import { query, validationResult } from "express-validator";
import { generalRateLimiter } from "../middleware/rateLimiters.js";
import { convertAmount } from "../services/fxPublicService.js";

const router = express.Router();

const validateConvert = [
  query("from").isLength({ min: 3, max: 3 }).isAlpha().toUpperCase(),
  query("to").isLength({ min: 3, max: 3 }).isAlpha().toUpperCase(),
  query("amount").isFloat({ gt: 0 }).toFloat(),
];

router.get(
  "/convert",
  generalRateLimiter,
  validateConvert,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { from, to, amount } = req.query;
      const data = await convertAmount(from, to, Number(amount));
      return res.json({ success: true, data });
    } catch (e) {
      console.error("[fx/convert]", e);
      return res.status(500).json({ success: false, error: e?.message || "FX error" });
    }
  }
);

export default router;
