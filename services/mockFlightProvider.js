/**
 * Tres vuelos estáticos (fallback demo / FLIGHT_PROVIDER=mock).
 */

/**
 *
 */
export class MockFlightProvider {
  /**
   * @param {import("./flightProvider.js").FlightSearchParams} params
   * @returns {Promise<import("./flightProvider.js").NormalizedFlightOffer[]>}
   */
  async searchOffers(params) {
    const origin = String(params.origin || "MEX").toUpperCase();
    const dest = String(params.destination || "CUN").toUpperCase();
    const date = String(params.departureDate || "2026-06-01");
    const pax = Math.max(1, Math.min(9, Number(params.passengers) || 1));

    return [
      {
        id: "mock-zz-001",
        airlineName: "Duffel Airways (sandbox)",
        airlineIata: "ZZ",
        departureAt: `${date}T08:00:00.000Z`,
        arrivalAt: `${date}T11:30:00.000Z`,
        durationLabel: "3h 30m",
        stops: 0,
        totalAmount: 2450 * pax,
        totalCurrency: "MXN",
        rawOfferId: "mock-zz-001",
      },
      {
        id: "mock-exp-002",
        airlineName: "Aerolínea Demo",
        airlineIata: "DM",
        departureAt: `${date}T14:15:00.000Z`,
        arrivalAt: `${date}T18:45:00.000Z`,
        durationLabel: "4h 30m",
        stops: 1,
        totalAmount: 1899.5 * pax,
        totalCurrency: "MXN",
        rawOfferId: "mock-exp-002",
      },
      {
        id: "mock-exp-003",
        airlineName: "Coco Charter",
        airlineIata: "CC",
        departureAt: `${date}T06:00:00.000Z`,
        arrivalAt: `${date}T09:10:00.000Z`,
        durationLabel: "3h 10m",
        stops: 0,
        totalAmount: 3100 * pax,
        totalCurrency: "MXN",
        rawOfferId: "mock-exp-003",
      },
    ].map((o) => ({
      ...o,
      id: `${o.id}-${origin}-${dest}`,
    }));
  }
}
