import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import exchangeRateService from "../services/exchangeRateService.js";

describe("ExchangeRateService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getExchangeRate", () => {
    it("should return cached rate if available", async () => {
      const mockCachedRate = {
        rate: 17.5,
        source: "Wise",
        date: "2026-04-13",
        fromCache: true
      };

      jest.spyOn(exchangeRateService, "getCachedRate").mockResolvedValue(mockCachedRate);

      const result = await exchangeRateService.getExchangeRate("USD", "MXN");

      expect(result).toEqual(mockCachedRate);
      expect(exchangeRateService.getCachedRate).toHaveBeenCalledWith("USD", "MXN");
    });

    it("should fetch from Wise API when no cache available", async () => {
      const mockWiseRate = {
        rate: 17.8,
        source: "Wise",
        date: "2026-04-13",
        fromCache: false
      };

      jest.spyOn(exchangeRateService, "getCachedRate").mockResolvedValue(null);
      jest.spyOn(exchangeRateService, "getWiseRate").mockResolvedValue(mockWiseRate);
      jest.spyOn(exchangeRateService, "cacheRate").mockResolvedValue();

      const result = await exchangeRateService.getExchangeRate("USD", "MXN");

      expect(result).toEqual(mockWiseRate);
      expect(exchangeRateService.getWiseRate).toHaveBeenCalledWith("USD", "MXN");
      expect(exchangeRateService.cacheRate).toHaveBeenCalledWith("USD", "MXN", 17.8, "Wise");
    });

    it("should fallback to DOF when Wise API fails", async () => {
      const mockDOFRate = {
        rate: 17.6,
        source: "DOF",
        date: "2026-04-13",
        fromCache: false
      };

      jest.spyOn(exchangeRateService, "getCachedRate").mockResolvedValue(null);
      jest.spyOn(exchangeRateService, "getWiseRate").mockRejectedValue(new Error("Wise API failed"));
      jest.spyOn(exchangeRateService, "getDOFRate").mockResolvedValue(mockDOFRate);
      jest.spyOn(exchangeRateService, "cacheRate").mockResolvedValue();

      const result = await exchangeRateService.getExchangeRate("USD", "MXN");

      expect(result).toEqual(mockDOFRate);
      expect(exchangeRateService.getDOFRate).toHaveBeenCalledWith();
      expect(exchangeRateService.cacheRate).toHaveBeenCalledWith("USD", "MXN", 17.6, "DOF");
    });

    it("should throw error when both APIs fail", async () => {
      jest.spyOn(exchangeRateService, "getCachedRate").mockResolvedValue(null);
      jest.spyOn(exchangeRateService, "getWiseRate").mockRejectedValue(new Error("Wise API failed"));
      jest.spyOn(exchangeRateService, "getDOFRate").mockRejectedValue(new Error("DOF API failed"));

      await expect(exchangeRateService.getExchangeRate("USD", "MXN")).rejects.toThrow("Both Wise and DOF APIs failed");
    });
  });

  describe("convertCurrency", () => {
    it("should convert currency using exchange rate", async () => {
      const mockRateData = {
        rate: 17.5,
        source: "Wise",
        date: "2026-04-13",
        fromCache: false
      };

      jest.spyOn(exchangeRateService, "getExchangeRate").mockResolvedValue(mockRateData);

      const result = await exchangeRateService.convertCurrency(100, "USD", "MXN");

      expect(result).toEqual({
        originalAmount: 100,
        originalCurrency: "USD",
        convertedAmount: 1750,
        targetCurrency: "MXN",
        exchangeRate: 17.5,
        dataSource: "Wise",
        rateDate: "2026-04-13",
        fromCache: false
      });
    });
  });
});
