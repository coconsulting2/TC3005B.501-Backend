/**
 * @module notificationService
 * @description Service layer for in-app notifications and user preferences (M3-006).
 * Provides CRUD for notifications and preference upsert/read.
 */
import prisma from "../database/config/prisma.js";
import { sendPushToUser } from "./webPushService.js";

/**
 * Creates an in-app notification for a user.
 * Respects `appNotif` and `browserNotif` preferences when available.
 *
 * @param {number} userId - Target user ID
 * @param {string} message - Notification message text
 * @returns {Promise<Object>} The created Notification record
 */
export async function createNotification(userId, message) {
  const pref = await prisma.userPreference.findUnique({ where: { userId } });

  let notification = null;

  // Default to true when no preference record exists yet
  const appEnabled = pref ? pref.appNotif : true;
  const browserEnabled = pref ? pref.browserNotif : true;

  if (appEnabled) {
    notification = await prisma.notification.create({
      data: { userId, message },
    });
  }

  if (browserEnabled) {
    try {
      await sendPushToUser(userId, message);
    } catch (err) {
      console.error("Web push failed for user", userId, err);
    }
  }

  return notification;
}

/**
 * Returns unread notifications for a user (most recent first, max 50).
 *
 * @param {number} userId - Target user ID
 * @returns {Promise<Object[]>} Array of Notification records
 */
export async function getNotifications(userId) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/**
 * Marks a single notification as read.
 *
 * @param {number} notificationId - Notification PK
 * @returns {Promise<Object>} Updated Notification record
 */
export async function markAsRead(notificationId) {
  return prisma.notification.update({
    where: { notificationId },
    data: { isRead: true },
  });
}

/**
 * Returns all unread notifications count for a user.
 *
 * @param {number} userId - Target user ID
 * @returns {Promise<number>} Count of unread notifications
 */
export async function getUnreadCount(userId) {
  return prisma.notification.count({
    where: { userId, isRead: false },
  });
}

/**
 * Returns notification preferences for a user.
 * If none exist yet, returns defaults (all true).
 *
 * @param {number} userId - Target user ID
 * @returns {Promise<Object>} Preference object
 */
export async function getPreferences(userId) {
  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  return pref || { userId, emailNotif: true, appNotif: true, browserNotif: true };
}

/**
 * Creates or updates notification preferences for a user.
 *
 * @param {number} userId - Target user ID
 * @param {Object} data - Preference flags
 * @param {boolean} [data.emailNotif] - Email notification toggle
 * @param {boolean} [data.appNotif] - In-app notification toggle
 * @param {boolean} [data.browserNotif] - Browser push notification toggle
 * @returns {Promise<Object>} Upserted UserPreference record
 */
export async function upsertPreferences(userId, data) {
  return prisma.userPreference.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

/**
 * Saves a Web Push subscription for a user.
 *
 * @param {number} userId - Target user ID
 * @param {Object} subscription - PushSubscription from the browser
 * @param {string} subscription.endpoint - Push service URL
 * @param {Object} subscription.keys - Encryption keys
 * @param {string} subscription.keys.p256dh - Public key
 * @param {string} subscription.keys.auth - Auth secret
 * @returns {Promise<Object>} Created or existing PushSubscription record
 */
export async function savePushSubscription(userId, subscription) {
  const { endpoint, keys } = subscription;
  return prisma.pushSubscription.upsert({
    where: {
      userId_endpoint: { userId, endpoint },
    },
    update: {
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    create: {
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });
}
