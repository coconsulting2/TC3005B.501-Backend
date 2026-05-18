/**
 * Búsqueda de ofertas vía Duffel API (@duffel/api). Requiere DUFFEL_ACCESS_TOKEN.
 */
import { createDuffelClient } from "./duffel.js";

/**
 *
 * @param isoStart
 * @param isoEnd
 */
function formatDuration(isoStart, isoEnd) {
  const a = new Date(isoStart).getTime();
  const b = new Date(isoEnd).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return "—";
  const mins = Math.round((b - a) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

/**
 *
 * @param offer
 */
function mapOffer(offer) {
  const slices = offer.slices || [];
  const firstSlice = slices[0];
  const segments = firstSlice?.segments || [];
  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];
  const marketing = firstSeg?.marketing_carrier;
  const airlineName = marketing?.name || "Airline";
  const airlineIata = marketing?.iata_code || "—";
  const stops = Math.max(0, segments.length - 1);

  return {
    id: offer.id,
    rawOfferId: offer.id,
    airlineName,
    airlineIata,
    departureAt: firstSeg?.departing_at || "",
    arrivalAt: lastSeg?.arriving_at || "",
    durationLabel: formatDuration(firstSeg?.departing_at, lastSeg?.arriving_at),
    stops,
    totalAmount: parseFloat(offer.total_amount),
    totalCurrency: offer.total_currency || "USD",
  };
}

/**
 *
 */
export class DuffelFlightProvider {
  /**
   * @param {import("./flightProvider.js").FlightSearchParams} params
   * @returns {Promise<import("./flightProvider.js").NormalizedFlightOffer[]>}
   */
  async searchOffers(params) {
    const duffel = createDuffelClient();
    const origin = String(params.origin || "").toUpperCase();
    const destination = String(params.destination || "").toUpperCase();
    const departureDate = String(params.departureDate || "");
    const passengers = Math.max(1, Math.min(9, Number(params.passengers) || 1));

    const returnDate = params.returnDate ? String(params.returnDate) : "";
    const slices = [
      {
        origin,
        destination,
        departure_date: departureDate,
      },
    ];
    if (returnDate && returnDate > departureDate) {
      slices.push({
        origin: destination,
        destination: origin,
        departure_date: returnDate,
      });
    }

    const { data } = await duffel.offerRequests.create({
      return_offers: true,
      slices,
      passengers: Array.from({ length: passengers }, () => ({ type: "adult" })),
      cabin_class: "economy",
    });

    const offers = data?.offers || [];
    return offers.slice(0, 20).map(mapOffer);
  }
}
