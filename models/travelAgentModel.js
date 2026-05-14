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

  /**
   * Persiste la oferta de vuelo seleccionada (JSON normalizado).
   * @param {number|string} requestId
   * @param {Object} offerPayload
   * @returns {Promise<boolean>}
   */
  async saveSelectedFlightOffer(requestId, offerPayload) {
    await prisma.request.update({
      where: { requestId: Number(requestId) },
      data: { selectedFlightOffer: offerPayload },
    });
    return true;
  },

  /**
   * Persiste la oferta de hospedaje seleccionada (Duffel Stays / JSON normalizado).
   * @param {number|string} requestId
   * @param {Object} offerPayload
   * @returns {Promise<boolean>}
   */
  async saveSelectedHotelOffer(requestId, offerPayload) {
    await prisma.request.update({
      where: { requestId: Number(requestId) },
      data: { selectedHotelOffer: offerPayload },
    });
    return true;
  },
};

export default TravelAgent;
