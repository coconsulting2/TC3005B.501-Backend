/**
 * @file requestCommentRoutes.js
 * @description Routes for request comments endpoints.
 */

import express from "express";
import { param, query, body } from "express-validator";
import * as requestCommentController from "../controllers/requestCommentController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

/**
 * Middleware: Basic request comment validation
 */
const validateCreateComment = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Request ID must be a positive integer")
    .toInt(),
  body("user_id")
    .isInt({ min: 1 })
    .withMessage("User ID must be a positive integer")
    .toInt(),
  body("content")
    .trim()
    .isLength({ min: 1, max: 45000 })
    .withMessage("Comment content is required and under max length"),
];

const validateReadComments = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Request ID must be a positive integer")
    .toInt(),
  query("user_id")
    .isInt({ min: 1 })
    .withMessage("User ID must be a positive integer")
    .toInt(),
  query("limit")
    .isInt({ min: 10, max: 200 })
    .withMessage("Limit must be between 10 and 200")
    .toInt(),
  query("cursor")
    .optional()
    .isString()
    .withMessage("Cursor must be a string"),
];

/**
 * POST /api/solicitudes/:id/comments
 * Create a comment for a travel request
 */
router.post(
  "/:id/comments",
  generalRateLimiter,
  authenticateToken,
  validateCreateComment,
  requestCommentController.createComment
);

/**
 * GET /api/solicitudes/:id/comments
 * Fetch comments for a travel request (with pagination)
 */
router.get(
  "/:id/comments",
  generalRateLimiter,
  authenticateToken,
  validateReadComments,
  requestCommentController.readComments
);

/**
 * GET /api/solicitudes/:id/comments/stream
 * Stream comments for a travel request via Server-Sent Events (SSE)
 */
router.get(
  "/:id/comments/stream",
  generalRateLimiter,
  authenticateToken,
  validateReadComments,
  requestCommentController.streamComments
);

export default router;

