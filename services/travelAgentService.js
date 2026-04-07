/**
 * @module travelAgentService
 * @description Business logic for travel agent operations.
 * Validates request status transitions and hotel/plane requirements
 * before delegating persistence to the model layer.
 */
import prismaDefault from "../database/config/prisma.js";

/** Status ID that allows the travel agency to act on a request. */
const TRAVEL_AGENCY_STATUS_ID = 5;

/** Status ID set after the travel agency attends the request. */
const ATTEND_STATUS_ID = 6;

/**
 * Attends a travel request: validates its current status is 5 (Atención Agencia de Viajes),
 * resolves hotel and plane requirements from its routes, then advances the status to 6
 * (Comprobación gastos del viaje).
 *
 * @param {number|string} requestId - ID of the travel request to attend.
 * @param {import('@prisma/client').PrismaClient} [prisma] - Prisma client (injectable for testing).
 * @returns {Promise<{requestId: number, newStatusId: number, needsHotel: boolean, needsPlane: boolean}>}
 * @throws {Error} 404 if request does not exist.
 * @throws {Error} 400 if request is not in status 5.
 */
export async function attendTravelRequest(requestId, prisma = prismaDefault) {
  const id = Number(requestId);

  const request = await prisma.request.findUnique({
    where: { requestId: id },
    include: {
      routeRequests: {
        include: { route: true },
      },
    },
  });

  if (!request) {
    const err = new Error("Travel request not found");
    err.status = 404;
    throw err;
  }

  if (request.requestStatusId !== TRAVEL_AGENCY_STATUS_ID) {
    const err = new Error(
      `Cannot attend request: current status is ${request.requestStatusId}, expected ${TRAVEL_AGENCY_STATUS_ID}`
    );
    err.status = 400;
    throw err;
  }

  const routes = request.routeRequests
    .map((rr) => rr.route)
    .filter(Boolean);

  const needsHotel = routes.some((r) => r.hotelNeeded);
  const needsPlane = routes.some((r) => r.planeNeeded);

  await prisma.request.update({
    where: { requestId: id },
    data: { requestStatusId: ATTEND_STATUS_ID },
  });

  return {
    requestId: id,
    newStatusId: ATTEND_STATUS_ID,
    needsHotel,
    needsPlane,
  };
}
