/**
 * @file tests/services/BER/exchangeRate.test.js
 * @description Unit tests for exchange-rate service orchestration and conversion behavior.
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import axios from "axios";
import exchangeRateService from "../../../services/exchangeRateService.js";

/**
 * @typedef {Object} ExchangeRateResult
 * @property {number} rate
 * @property {string} source
 * @property {string} date
 * @property {boolean} fromCache
 */

describe("ExchangeRateService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BMX_API_URL = "https://banxico.example.test/api";
    process.env.BANXICO_API_KEY = "test-token";
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
      expect(exchangeRateService.getDOFRate).toHaveBeenCalledWith("USD", "MXN");
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

  describe("getRateHistory", () => {
    it("rejects non-YYYY-MM-DD date input before making outbound request", async () => {
      const axiosGetSpy = jest.spyOn(axios, "get").mockResolvedValue({ data: {} });

      await expect(
        exchangeRateService.getRateHistory("USD", "MXN", "2026-04-01/../../secret", "2026-04-10")
      ).rejects.toThrow("startDate must use YYYY-MM-DD format");

      expect(axiosGetSpy).not.toHaveBeenCalled();
    });

    it("constructs history endpoint URL from trusted segments", async () => {
      const axiosGetSpy = jest.spyOn(axios, "get").mockResolvedValue({
        data: {
          bmx: {
            series: [{ datos: [{ fecha: "01/04/2026", dato: "17.80" }] }]
          }
        }
      });

      await exchangeRateService.getRateHistory("USD", "MXN", "2026-04-01", "2026-04-10");

      expect(axiosGetSpy).toHaveBeenCalledTimes(1);
      expect(axiosGetSpy).toHaveBeenCalledWith(
        "https://banxico.example.test/api/series/SF43718/datos/2026-04-01/2026-04-10",
        expect.objectContaining({
          headers: expect.objectContaining({ "Bmx-Token": "test-token" })
        })
      );
    });
  });
});
