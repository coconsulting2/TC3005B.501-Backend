/**
 * @module travelAgentModel
 * @description Data access layer for travel agent queries using Prisma.
 */
import prisma from "../database/config/prisma.js";

/**
 * Normaliza oferta guardada (legacy objeto único → v2 con segments).
 * @param {unknown} existing
 * @returns {{ version: 2, segments: Array<{ router_index: number, label?: string, offer: object }> }}
 */
function normalizeFlightOfferStorage(existing) {
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    return { version: 2, segments: [] };
  }
  const obj = /** @type {Record<string, unknown>} */ (existing);
  if (obj.version === 2 && Array.isArray(obj.segments)) {
    return {
      version: 2,
      segments: obj.segments.filter(
        (s) =>
          s &&
          typeof s === "object" &&
          s.router_index != null &&
          s.offer &&
          typeof s.offer === "object",
      ),
    };
  }
  if ("airlineName" in obj || "totalAmount" in obj) {
    return { version: 2, segments: [{ router_index: 0, offer: obj }] };
  }
  return { version: 2, segments: [] };
}

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
   * Multidestino: merge por router_index en { version: 2, segments: [...] }.
   * @param {number|string} requestId
   * @param {Object} offerPayload
   * @param {{ routerIndex?: number, segmentLabel?: string }} [meta]
   * @returns {Promise<boolean>}
   */
  async saveSelectedFlightOffer(requestId, offerPayload, meta = {}) {
    const routerIndex =
      meta.routerIndex !== undefined && meta.routerIndex !== null
        ? Number(meta.routerIndex)
        : 0;

    const row = await prisma.request.findUnique({
      where: { requestId: Number(requestId) },
      select: { selectedFlightOffer: true },
    });

    const storage = normalizeFlightOfferStorage(row?.selectedFlightOffer);
    const rest = storage.segments.filter((s) => Number(s.router_index) !== routerIndex);
    rest.push({
      router_index: routerIndex,
      ...(meta.segmentLabel ? { label: String(meta.segmentLabel) } : {}),
      offer: offerPayload,
    });
    rest.sort((a, b) => Number(a.router_index) - Number(b.router_index));

    await prisma.request.update({
      where: { requestId: Number(requestId) },
      data: { selectedFlightOffer: { version: 2, segments: rest } },
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
