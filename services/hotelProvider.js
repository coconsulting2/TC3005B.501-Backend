/**
 * Proveedor de hospedaje: Duffel Stays (sandbox) o mock.
 * - HOTEL_PROVIDER=mock | duffel (explícito)
 * - Si no se define: mock por defecto (vuelos pueden usar Duffel sin Stays habilitado).
 * - HOTEL_PROVIDER=duffel o herencia con FLIGHT_PROVIDER=duffel: intenta Duffel y cae a mock si Stays no está en la cuenta.
 */
import { MockHotelProvider } from "./mockHotelProvider.js";
import { ResilientHotelProvider } from "./resilientHotelProvider.js";

/**
 * @returns {ResilientHotelProvider | MockHotelProvider}
 */
export function getHotelProvider() {
  const hotelExplicit = process.env.HOTEL_PROVIDER
    ? String(process.env.HOTEL_PROVIDER).toLowerCase()
    : "";

  if (hotelExplicit === "mock") {
    return new MockHotelProvider();
  }

  const useDuffel =
    hotelExplicit === "duffel" ||
    (!hotelExplicit && String(process.env.FLIGHT_PROVIDER || "mock").toLowerCase() === "duffel");

  if (useDuffel) {
    return new ResilientHotelProvider();
  }

  return new MockHotelProvider();
}

/**
 * @param {ResilientHotelProvider | MockHotelProvider} provider
 * @returns {string}
 */
export function getActiveHotelProviderLabel(provider) {
  if (provider instanceof ResilientHotelProvider) {
    return provider.lastProviderUsed === "mock_fallback" ? "mock_fallback" : "duffel";
  }
  return "mock";
}
