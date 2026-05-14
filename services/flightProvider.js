/**
 * Proveedor de vuelos: contrato común + selector por FLIGHT_PROVIDER (TF-010).
 */

import { MockFlightProvider } from "./mockFlightProvider.js";
import { DuffelFlightProvider } from "./duffelFlightProvider.js";

/**
 * @typedef {Object} FlightSearchParams
 * @property {string} origin - IATA
 * @property {string} destination - IATA
 * @property {string} departureDate - YYYY-MM-DD
 * @property {number} passengers
 */

/**
 * @typedef {Object} NormalizedFlightOffer
 * @property {string} id
 * @property {string} airlineName
 * @property {string} airlineIata
 * @property {string} departureAt - ISO
 * @property {string} arrivalAt - ISO
 * @property {string} durationLabel
 * @property {number} stops
 * @property {number} totalAmount
 * @property {string} totalCurrency
 * @property {string} [rawOfferId] - id proveedor (Duffel offer id)
 */

/**
 *
 */
export function getFlightProvider() {
  const mode = String(process.env.FLIGHT_PROVIDER || "mock").toLowerCase();
  if (mode === "duffel") {
    return new DuffelFlightProvider();
  }
  return new MockFlightProvider();
}
