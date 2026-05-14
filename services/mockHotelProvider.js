/**
 * Ofertas de hotel estáticas — solo con `HOTEL_PROVIDER=mock` (sin Duffel).
 */

/**
 * @typedef {Object} HotelSearchParams
 * @property {string} ciudad - texto libre (ciudad o zona)
 * @property {string} fechaEntrada - YYYY-MM-DD
 * @property {string} fechaSalida - YYYY-MM-DD
 * @property {number} huespedes
 */

/**
 * @typedef {Object} NormalizedHotelOffer
 * @property {string} id
 * @property {string} hotelName
 * @property {string} addressHint
 * @property {string} checkIn - YYYY-MM-DD
 * @property {string} checkOut - YYYY-MM-DD
 * @property {number} nights
 * @property {number} totalAmount
 * @property {string} totalCurrency
 * @property {number} stars
 */

export class MockHotelProvider {
  /**
   * @param {HotelSearchParams} params
   * @returns {Promise<NormalizedHotelOffer[]>}
   */
  async searchOffers(params) {
    const city = String(params.ciudad || "CDMX").trim() || "CDMX";
    const checkIn = String(params.fechaEntrada || "2026-06-01");
    const checkOut = String(params.fechaSalida || "2026-06-03");
    const guests = Math.max(1, Math.min(9, Number(params.huespedes) || 1));

    const inD = new Date(`${checkIn}T12:00:00Z`);
    const outD = new Date(`${checkOut}T12:00:00Z`);
    const nights = Math.max(
      1,
      Math.round((outD.getTime() - inD.getTime()) / (24 * 60 * 60 * 1000)) || 1,
    );

    const base = 1200 * nights * guests;

    return [
      {
        id: `mock-hotel-001-${city}`,
        hotelName: `Hotel Sandbox ${city}`,
        addressHint: `Zona centro · ${city}`,
        checkIn,
        checkOut,
        nights,
        totalAmount: Math.round(base * 1.05),
        totalCurrency: "MXN",
        stars: 4,
        provider: "mock",
      },
      {
        id: `mock-hotel-002-${city}`,
        hotelName: "CocoStay Demo (mock)",
        addressHint: `Cerca de avenida principal · ${city}`,
        checkIn,
        checkOut,
        nights,
        totalAmount: Math.round(base * 0.92),
        totalCurrency: "MXN",
        stars: 3,
        provider: "mock",
      },
      {
        id: `mock-hotel-003-${city}`,
        hotelName: "Business Inn Express (mock)",
        addressHint: `Distrito financiero · ${city}`,
        checkIn,
        checkOut,
        nights,
        totalAmount: Math.round(base * 1.28),
        totalCurrency: "MXN",
        stars: 5,
        provider: "mock",
      },
    ];
  }
}
