/**
 * @module webPushService
 * @description Web Push notification sender using the web-push library (M3-006).
 * Uses VAPID keys from environment variables. No third-party service required.
 */
import webpush from "web-push";
import prisma from "../database/config/prisma.js";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_MAILTO = process.env.VAPID_MAILTO || "mailto:admin@coconsulting.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC, VAPID_PRIVATE);
}

/**
 * Sends a push notification to all registered browser subscriptions for a user.
 *
 * @param {number} userId - Target user ID
 * @param {string} message - Notification body text
 * @returns {Promise<void>}
 */
export async function sendPushToUser(userId, message) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("VAPID keys not configured — skipping web push");
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  const payload = JSON.stringify({
    title: "CocoAPI — Nueva notificación",
    body: message,
    icon: "/Logo.svg",
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      )
    )
  );

  // Clean up expired/invalid subscriptions (410 Gone)
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "rejected") {
      const err = results[i].reason;
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await prisma.pushSubscription.delete({
          where: { id: subscriptions[i].id },
        }).catch(() => {});
      }
    }
  }
}

/**
 * Returns the public VAPID key so the frontend can subscribe.
 *
 * @returns {string} The VAPID public key
 */
export function getVapidPublicKey() {
  return VAPID_PUBLIC;
}
