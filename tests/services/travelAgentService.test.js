/**
 * @module travelAgentService.test
 * @description Unit tests for travelAgentService.attendTravelRequest.
 * Uses an injected mock Prisma client — no real DB required.
 *
 * Status IDs:
 *   5 = Atención Agencia de Viajes  (required source status)
 *   6 = Comprobación gastos del viaje (expected target status)
 */
import { describe, test, expect, jest, beforeEach, beforeAll } from "@jest/globals";

// ─── Mock the Prisma singleton so it is never instantiated ───────────────────
jest.unstable_mockModule("../../database/config/prisma.js", () => ({
  default: {},
}));

// Import the service AFTER the mock is registered (dynamic import)
let attendTravelRequest;
beforeAll(async () => {
  const mod = await import("../../services/travelAgentService.js");
  attendTravelRequest = mod.attendTravelRequest;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Builds a minimal mock Prisma client.
 * @param {object|null} requestData - Value returned by findUnique (null = not found).
 * @returns {object} Mock prisma with request.findUnique and request.update.
 */
const makePrisma = (requestData) => ({
  request: {
    findUnique: jest.fn().mockResolvedValue(requestData),
    update: jest.fn().mockResolvedValue({}),
  },
});

/**
 * Builds a minimal mock request as Prisma would return it.
 * @param {number} statusId
 * @param {Array<{hotelNeeded: boolean, planeNeeded: boolean}>} routes
 * @returns {object}
 */
const makeRequest = (statusId, routes = []) => ({
  requestId: 42,
  requestStatusId: statusId,
  routeRequests: routes.map((route) => ({ route })),
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("travelAgentService.attendTravelRequest", () => {
  // ── Not found ───────────────────────────────────────────────────────────

  test("throws 404 when request does not exist", async () => {
    const prisma = makePrisma(null);

    await expect(attendTravelRequest(99, prisma)).rejects.toMatchObject({
      message: "Travel request not found",
      status: 404,
    });

    expect(prisma.request.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { requestId: 99 } })
    );
    expect(prisma.request.update).not.toHaveBeenCalled();
  });

  // ── Wrong status ─────────────────────────────────────────────────────────

  test("throws 400 when status is 1 (not 5)", async () => {
    const prisma = makePrisma(makeRequest(1));

    await expect(attendTravelRequest(42, prisma)).rejects.toMatchObject({
      status: 400,
    });

    expect(prisma.request.update).not.toHaveBeenCalled();
  });

  test("throws 400 when status is already 6 (already attended)", async () => {
    const prisma = makePrisma(makeRequest(6));

    await expect(attendTravelRequest(42, prisma)).rejects.toMatchObject({
      status: 400,
    });
  });

  // ── Happy path — no hotel, no plane ─────────────────────────────────────

  test("succeeds with status 5 and routes needing neither hotel nor plane", async () => {
    const prisma = makePrisma(
      makeRequest(5, [
        { hotelNeeded: false, planeNeeded: false },
        { hotelNeeded: false, planeNeeded: false },
      ])
    );

    const result = await attendTravelRequest(42, prisma);

    expect(result).toEqual({
      requestId: 42,
      newStatusId: 6,
      needsHotel: false,
      needsPlane: false,
    });
    expect(prisma.request.update).toHaveBeenCalledWith({
      where: { requestId: 42 },
      data: { requestStatusId: 6 },
    });
  });

  // ── Hotel needed ─────────────────────────────────────────────────────────

  test("returns needsHotel: true when at least one route requires hotel", async () => {
    const prisma = makePrisma(
      makeRequest(5, [
        { hotelNeeded: true, planeNeeded: false },
        { hotelNeeded: false, planeNeeded: false },
      ])
    );

    const result = await attendTravelRequest(42, prisma);

    expect(result.needsHotel).toBe(true);
    expect(result.needsPlane).toBe(false);
    expect(result.newStatusId).toBe(6);
  });

  // ── Plane needed ─────────────────────────────────────────────────────────

  test("returns needsPlane: true when at least one route requires plane", async () => {
    const prisma = makePrisma(
      makeRequest(5, [{ hotelNeeded: false, planeNeeded: true }])
    );

    const result = await attendTravelRequest(42, prisma);

    expect(result.needsPlane).toBe(true);
    expect(result.needsHotel).toBe(false);
  });

  // ── Both hotel and plane ──────────────────────────────────────────────────

  test("returns needsHotel: true and needsPlane: true when both are needed", async () => {
    const prisma = makePrisma(
      makeRequest(5, [{ hotelNeeded: true, planeNeeded: true }])
    );

    const result = await attendTravelRequest(42, prisma);

    expect(result.needsHotel).toBe(true);
    expect(result.needsPlane).toBe(true);
  });

  // ── No routes ────────────────────────────────────────────────────────────

  test("returns false for both when request has no routes", async () => {
    const prisma = makePrisma(makeRequest(5, []));

    const result = await attendTravelRequest(42, prisma);

    expect(result.needsHotel).toBe(false);
    expect(result.needsPlane).toBe(false);
    expect(result.newStatusId).toBe(6);
  });

  // ── String id coercion ────────────────────────────────────────────────────

  test("coerces string requestId to number", async () => {
    const prisma = makePrisma(makeRequest(5, []));

    const result = await attendTravelRequest("42", prisma);

    expect(result.requestId).toBe(42);
    expect(prisma.request.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { requestId: 42 } })
    );
  });
});
