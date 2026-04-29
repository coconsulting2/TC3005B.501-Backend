/**
 * @module notificationRoutes
 * @description Express router for the notification center API (M3-006).
 * Endpoints for listing notifications, marking read, managing preferences, and Web Push.
 */
import express from "express";
import * as ctrl from "../controllers/notificationController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { generalRateLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

// All notification routes require authentication
router.use(authenticateToken);

// --- VAPID public key (needed before subscribing) ---
router.get("/vapid-public-key", generalRateLimiter, ctrl.getVapidKey);

// --- Preferences ---
router.get("/preferences/:userId", generalRateLimiter, ctrl.getPreferences);
router.put("/preferences/:userId", generalRateLimiter, ctrl.updatePreferences);

// --- Push subscription ---
router.post("/subscribe", generalRateLimiter, ctrl.subscribe);

// --- Notifications ---
router.get("/:userId", generalRateLimiter, ctrl.getNotifications);
router.get("/:userId/unread-count", generalRateLimiter, ctrl.getUnreadCount);
router.put("/:id/read", generalRateLimiter, ctrl.markAsRead);

export default router;
