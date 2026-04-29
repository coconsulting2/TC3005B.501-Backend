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

// Apply rate limiting before authentication to protect auth checks from request floods
router.use(generalRateLimiter);

// All notification routes require authentication
router.use(authenticateToken);

// --- VAPID public key (needed before subscribing) ---
router.get("/vapid-public-key", ctrl.getVapidKey);

// --- Preferences ---
router.get("/preferences/:userId", ctrl.getPreferences);
router.put("/preferences/:userId", ctrl.updatePreferences);

// --- Push subscription ---
router.post("/subscribe", ctrl.subscribe);

// --- Notifications ---
router.get("/:userId", ctrl.getNotifications);
router.get("/:userId/unread-count", ctrl.getUnreadCount);
router.put("/:id/read", ctrl.markAsRead);

export default router;
