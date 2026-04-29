/**
 * @module notificationController
 * @description Handles HTTP requests for the notification center (M3-006).
 * Provides endpoints for listing, reading, and subscribing to push notifications.
 */
import * as notificationService from "../services/notificationService.js";
import { getVapidPublicKey } from "../services/webPushService.js";

/**
 * GET /api/notifications/:userId
 * Returns all notifications for a user (max 50, newest first).
 *
 * @param {import('express').Request} req - Express request (params: userId)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON array of notifications
 */
export async function getNotifications(req, res) {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    const notifications = await notificationService.getNotifications(userId);
    return res.status(200).json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/notifications/:userId/unread-count
 * Returns the count of unread notifications for a user.
 *
 * @param {import('express').Request} req - Express request (params: userId)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON { count: number }
 */
export async function getUnreadCount(req, res) {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    const count = await notificationService.getUnreadCount(userId);
    return res.status(200).json({ count });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PUT /api/notifications/:id/read
 * Marks a single notification as read.
 *
 * @param {import('express').Request} req - Express request (params: id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with updated notification
 */
export async function markAsRead(req, res) {
  try {
    const notificationId = parseInt(req.params.id);
    if (isNaN(notificationId)) {
      return res.status(400).json({ error: "Invalid notification ID" });
    }
    const updated = await notificationService.markAsRead(notificationId);
    return res.status(200).json(updated);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Notification not found" });
    }
    console.error("Error marking notification as read:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/notifications/preferences/:userId
 * Returns notification preferences for a user.
 *
 * @param {import('express').Request} req - Express request (params: userId)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with preference object
 */
export async function getPreferences(req, res) {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    const prefs = await notificationService.getPreferences(userId);
    return res.status(200).json(prefs);
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PUT /api/notifications/preferences/:userId
 * Creates or updates notification preferences for a user.
 *
 * @param {import('express').Request} req - Express request (params: userId, body: preference flags)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with updated preference object
 */
export async function updatePreferences(req, res) {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    const { emailNotif, appNotif, browserNotif } = req.body;
    const data = {};
    if (typeof emailNotif === "boolean") data.emailNotif = emailNotif;
    if (typeof appNotif === "boolean") data.appNotif = appNotif;
    if (typeof browserNotif === "boolean") data.browserNotif = browserNotif;

    const prefs = await notificationService.upsertPreferences(userId, data);
    return res.status(200).json(prefs);
  } catch (error) {
    console.error("Error updating preferences:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/notifications/subscribe
 * Saves a Web Push subscription for the authenticated user.
 *
 * @param {import('express').Request} req - Express request (body: subscription object)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with created subscription
 */
export async function subscribe(req, res) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: "Invalid subscription payload" });
    }
    const saved = await notificationService.savePushSubscription(userId, subscription);
    return res.status(201).json(saved);
  } catch (error) {
    console.error("Error saving push subscription:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/notifications/vapid-public-key
 * Returns the VAPID public key so the frontend can create a push subscription.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON { key: string }
 */
export async function getVapidKey(req, res) {
  return res.status(200).json({ key: getVapidPublicKey() });
}
