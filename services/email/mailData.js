/**
 * @module mailData
 * @description Fetches the travel request and user data needed to populate email notifications.
 */
import prisma from "../../database/config/prisma.js";
import { decrypt } from "../../middleware/decryption.js";

/**
 * Retrieves user contact details and request status for a given travel request.
 * Decrypts the user's email before returning so it can be used directly by the mailer.
 * @param {string|number} request_id - ID of the travel request to look up
 * @returns {Promise<{user_email: string, user_name: string, request_id: number, status: string}>}
 */
async function getMailDetails(request_id) {
  const request = await prisma.request.findUnique({
    where: { requestId: Number(request_id) },
    include: {
      user: true,
      requestStatus: true,
    },
  });

  if (!request || !request.user) {
    throw new Error(`No request found with id ${request_id}`);
  }

  return {
    user_email: decrypt(request.user.email),
    user_name: request.user.userName,
    request_id: request.requestId,
    status: request.requestStatus.status,
  };
}

export default getMailDetails;
