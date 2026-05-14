/**
 * Proveedor de hospedaje: Duffel Stays (sandbox) o mock solo si HOTEL_PROVIDER=mock.
 * Por defecto hereda FLIGHT_PROVIDER: si vuelos usan Duffel, hoteles usan el mismo token/sandbox.
 */
import { MockHotelProvider } from "./mockHotelProvider.js";
import { DuffelStaysProvider } from "./duffelStaysProvider.js";

/**
 * @returns {{ searchOffers: (p: { ciudad: string, fechaEntrada: string, fechaSalida: string, huespedes: number }) => Promise<unknown[]> }}
 */
export function getHotelProvider() {
  const hotelExplicit = process.env.HOTEL_PROVIDER ? String(process.env.HOTEL_PROVIDER).toLowerCase() : "";
  if (hotelExplicit === "mock") {
    return new MockHotelProvider();
  }
  if (hotelExplicit === "duffel") {
    return new DuffelStaysProvider();
  }
  const flightMode = String(process.env.FLIGHT_PROVIDER || "mock").toLowerCase();
  if (flightMode === "duffel") {
    return new DuffelStaysProvider();
  }
  return new MockHotelProvider();
}

/**
 * @returns {string}
 */
export function getActiveHotelProviderLabel() {
  const hotelExplicit = process.env.HOTEL_PROVIDER ? String(process.env.HOTEL_PROVIDER).toLowerCase() : "";
  if (hotelExplicit === "mock" || hotelExplicit === "duffel") return hotelExplicit;
  return String(process.env.FLIGHT_PROVIDER || "mock").toLowerCase() === "duffel" ? "duffel" : "mock";
}
