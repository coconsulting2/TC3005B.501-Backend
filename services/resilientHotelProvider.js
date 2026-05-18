/**
 * Intenta Duffel Stays; si la cuenta no tiene Stays habilitado (403), usa mock.
 */
import { DuffelStaysProvider } from "./duffelStaysProvider.js";
import { MockHotelProvider } from "./mockHotelProvider.js";
import { isStaysAccessDeniedError } from "./duffelStaysApi.js";

export class ResilientHotelProvider {
  constructor() {
    this._duffel = new DuffelStaysProvider();
    this._mock = new MockHotelProvider();
    /** @type {'duffel_stays' | 'mock' | 'mock_fallback'} */
    this.lastProviderUsed = "duffel_stays";
  }

  /**
   * @param {import("./mockHotelProvider.js").HotelSearchParams} params
   */
  async searchOffers(params) {
    try {
      const offers = await this._duffel.searchOffers(params);
      this.lastProviderUsed = "duffel_stays";
      return offers;
    } catch (err) {
      if (!isStaysAccessDeniedError(err)) {
        throw err;
      }
      console.warn(
        "[hotels] Duffel Stays no está habilitado en esta cuenta (403). Usando proveedor mock.",
      );
      const offers = await this._mock.searchOffers(params);
      this.lastProviderUsed = "mock_fallback";
      return offers.map((o) => ({ ...o, provider: "mock_fallback" }));
    }
  }

  /**
   * @param {string} searchResultId
   */
  async fetchAllRates(searchResultId) {
    return this._duffel.fetchAllRates(searchResultId);
  }
}
