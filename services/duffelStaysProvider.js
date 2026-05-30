/**
 * Búsqueda de hospedaje vía Duffel Stays (sandbox con DUFFEL_ACCESS_TOKEN).
 * @see https://duffel.com/docs/api/stays/search
 */
import { staysFetchAllRates, staysSearch } from "./duffelStaysApi.js";

/** Radio por defecto en km (Duffel: 1–100; 5–10 suele ir bien por ciudad). */
const DEFAULT_RADIUS_KM = Number(process.env.STAYS_SEARCH_RADIUS_KM) || 10;

/** @type {Array<{ keys: string[]; latitude: number; longitude: number }>} */
const CITY_HINTS = [
  { keys: ["cdmx", "ciudad de mexico", "mexico city", "df", "cd mx"], latitude: 19.4326, longitude: -99.1332 },
  { keys: ["monterrey", "mty"], latitude: 25.6866, longitude: -100.3161 },
  { keys: ["guadalajara", "gdl"], latitude: 20.6597, longitude: -103.3496 },
  { keys: ["cancun", "cancún", "cun"], latitude: 21.1619, longitude: -86.8515 },
  { keys: ["merida", "mérida", "mid"], latitude: 20.9674, longitude: -89.5926 },
  { keys: ["puebla"], latitude: 19.0414, longitude: -98.2063 },
  { keys: ["queretaro", "querétaro", "qro"], latitude: 20.5888, longitude: -100.3899 },
  { keys: ["tijuana", "tij"], latitude: 32.5149, longitude: -117.0382 },
  { keys: ["los cabos", "cabo san lucas", "sjd"], latitude: 22.8905, longitude: -109.9167 },
];

/**
 * @param {string} ciudad
 * @returns {{ latitude: number; longitude: number }}
 */
export function resolveCityToCoordinates(ciudad) {
  const raw = String(ciudad ?? "").trim();
  if (!raw) {
    return { latitude: 19.4326, longitude: -99.1332 };
  }
  const norm = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  for (const row of CITY_HINTS) {
    if (row.keys.some((k) => norm.includes(k))) {
      return { latitude: row.latitude, longitude: row.longitude };
    }
  }
  return { latitude: 19.4326, longitude: -99.1332 };
}

/**
 * @param {any} data
 */
export function mapStaysResults(data) {
  const results = data?.results ?? [];
  return results.slice(0, 20).map((result) => {
    const acc = result.accommodation;
    const addr = acc?.location?.address;
    const hint = [addr?.line_one, addr?.city_name].filter(Boolean).join(" · ") || addr?.city_name || "";

    const checkIn = result.check_in_date;
    const checkOut = result.check_out_date;
    const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    const nights = Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 86400000)) : 1;

    const star = typeof acc?.rating === "number" ? acc.rating : acc?.ratings?.[0]?.value ?? 0;

    return {
      id: result.id,
      rawOfferId: result.id,
      searchResultId: result.id,
      accommodationId: acc?.id ?? null,
      hotelName: acc?.name ?? "Hospedaje",
      addressHint: hint,
      checkIn,
      checkOut,
      nights,
      totalAmount: parseFloat(String(result.cheapest_rate_total_amount ?? "0")),
      totalCurrency: result.cheapest_rate_currency || "MXN",
      stars: typeof star === "number" ? star : 0,
      provider: "duffel_stays",
    };
  });
}

/**
 * @param {any} searchResult
 * @param {import("./duffelStaysProvider.js").ReturnType<typeof mapStaysResults>[number]} baseOffer
 */
export function enrichOfferFromFetchAllRates(searchResult, baseOffer) {
  const acc = searchResult?.accommodation ?? {};
  const rooms = acc?.rooms ?? [];
  const rates = rooms.flatMap((room) =>
    (room?.rates ?? []).map((rate) => ({
      rateId: rate.id,
      roomName: room.name,
      rateName: rate.name,
      totalAmount: parseFloat(String(rate.total_amount ?? "0")),
      totalCurrency: rate.total_currency || baseOffer.totalCurrency,
      boardType: rate.board_type,
    })),
  );

  const cheapest = rates.length
    ? rates.reduce((a, b) => (a.totalAmount <= b.totalAmount ? a : b))
    : null;

  return {
    ...baseOffer,
    hotelName: acc?.name ?? baseOffer.hotelName,
    addressHint:
      [acc?.location?.address?.line_one, acc?.location?.address?.city_name]
        .filter(Boolean)
        .join(" · ") || baseOffer.addressHint,
    totalAmount: cheapest?.totalAmount ?? baseOffer.totalAmount,
    totalCurrency: cheapest?.totalCurrency ?? baseOffer.totalCurrency,
    stars: typeof acc?.rating === "number" ? acc.rating : baseOffer.stars,
    rates,
    ratesFetched: true,
  };
}

/**
 * @typedef {Object} HotelSearchParams
 * @property {string} ciudad
 * @property {string} fechaEntrada - YYYY-MM-DD
 * @property {string} fechaSalida - YYYY-MM-DD
 * @property {number} huespedes
 */

/**
 *
 */
export class DuffelStaysProvider {
  /**
   * @param {HotelSearchParams} params
   */
  async searchOffers(params) {
    const { latitude, longitude } = resolveCityToCoordinates(params.ciudad);
    const adults = Math.max(1, Math.min(9, Number(params.huespedes) || 1));
    const guests = Array.from({ length: adults }, () => ({ type: "adult" }));

    const response = await staysSearch({
      coordinates: { latitude, longitude },
      radiusKm: DEFAULT_RADIUS_KM,
      checkInDate: params.fechaEntrada,
      checkOutDate: params.fechaSalida,
      rooms: 1,
      guests,
    });

    return mapStaysResults(response?.data);
  }

  /**
   * @param {string} searchResultId
   * @param {ReturnType<typeof mapStaysResults>[number]} [baseOffer]
   */
  async fetchAllRates(searchResultId, baseOffer = null) {
    const response = await staysFetchAllRates(searchResultId);
    const result = response?.data;
    if (baseOffer) {
      return enrichOfferFromFetchAllRates(result, baseOffer);
    }
    return result;
  }
}
