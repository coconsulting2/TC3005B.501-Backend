/**
 * @module travelAgentModel
 * @description Data access layer for travel agent queries using Prisma.
 */
import prisma from "../database/config/prisma.js";

const TravelAgent = {
  /**
   * Mark a travel request as being attended (status 6).
   * @param {number} requestId - Request ID.
   * @returns {Promise<boolean>} True if updated successfully.
   */
  async attendTravelRequest(requestId) {
    await prisma.request.update({
      where: { requestId: Number(requestId) },
      data: { requestStatusId: 6 },
    });
    return true;
  },

  /**
   * Check whether a request exists in the database.
   * @param {number} requestId - Request ID.
   * @returns {Promise<boolean>} True if the request exists.
   */
  async requestExists(requestId) {
    const request = await prisma.request.findUnique({
      where: { requestId: Number(requestId) },
      select: { requestId: true },
    });
    return !!request;
  },
};

export default TravelAgent;
