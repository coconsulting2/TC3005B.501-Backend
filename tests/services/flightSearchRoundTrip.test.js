/**
 * @file tests/services/flightSearchRoundTrip.test.js
 */
import { describe, test, expect } from "@jest/globals";
import { MockFlightProvider } from "../../services/mockFlightProvider.js";

describe("MockFlightProvider round trip", () => {
  test("searchOffers acepta returnDate y marca ofertas ida y vuelta", async () => {
    const provider = new MockFlightProvider();
    const offers = await provider.searchOffers({
      origin: "MEX",
      destination: "CUN",
      departureDate: "2026-06-10",
      returnDate: "2026-06-15",
      passengers: 1,
    });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].id).toContain("-rt");
    expect(offers[0].durationLabel).toContain("ida y vuelta");
  });

  test("searchOffers sin returnDate no marca round trip", async () => {
    const provider = new MockFlightProvider();
    const offers = await provider.searchOffers({
      origin: "MEX",
      destination: "CUN",
      departureDate: "2026-06-10",
      passengers: 1,
    });
    expect(offers[0].id).not.toContain("-rt");
  });
});
