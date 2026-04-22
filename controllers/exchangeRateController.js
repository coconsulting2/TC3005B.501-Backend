import exchangeRateService from "../services/exchangeRateService.js";
import { body, query, validationResult } from "express-validator";

/**
 * HTTP controller for exchange-rate endpoints.
 */
class ExchangeRateController {
  /**
   * GET endpoint returning the current exchange rate.
   * @param {Object} req Express request.
   * @param {Object} res Express response.
   * @returns {Promise<void>}
   */
  async getExchangeRate(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { source = "USD", target = "MXN" } = req.query;

      const rateData = await exchangeRateService.getExchangeRate(source, target);

      res.json({
        success: true,
        data: rateData,
        message: `Exchange rate from ${source} to ${target} retrieved successfully`
      });
    } catch (error) {
      console.error("Error in getExchangeRate controller:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve exchange rate",
        error: error.message
      });
    }
  }

  /**
   * POST endpoint converting an amount between two currencies.
   * @param {Object} req Express request.
   * @param {Object} res Express response.
   * @returns {Promise<void>}
   */
  async convertCurrency(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { amount, source = "USD", target = "MXN" } = req.body;

      const conversionResult = await exchangeRateService.convertCurrency(
        parseFloat(amount),
        source,
        target
      );

      res.json({
        success: true,
        data: conversionResult,
        message: `Currency conversion from ${source} to ${target} completed successfully`
      });
    } catch (error) {
      console.error("Error in convertCurrency controller:", error);
      res.status(500).json({
        success: false,
        message: "Failed to convert currency",
        error: error.message
      });
    }
  }

  /**
   * GET endpoint returning the list of supported currencies.
   * @param {Object} req Express request.
   * @param {Object} res Express response.
   * @returns {Promise<void>}
   */
  async getSupportedCurrencies(req, res) {
    try {
      const currencies = await exchangeRateService.getSupportedCurrencies();

      res.json({
        success: true,
        data: currencies,
        message: "Supported currencies retrieved successfully"
      });
    } catch (error) {
      console.error("Error in getSupportedCurrencies controller:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve supported currencies",
        error: error.message
      });
    }
  }

  /**
   * GET endpoint returning historical exchange rates.
   * @param {Object} req Express request.
   * @param {Object} res Express response.
   * @returns {Promise<void>}
   */
  async getRateHistory(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { source = "USD", target = "MXN", startDate, endDate } = req.query;

      const history = await exchangeRateService.getRateHistory(source, target, startDate, endDate);

      res.json({
        success: true,
        data: history,
        message: `Rate history from ${source} to ${target} retrieved successfully`
      });
    } catch (error) {
      console.error("Error in getRateHistory controller:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve rate history",
        error: error.message
      });
    }
  }

  /**
   * Returns express-validator chain for the exchange-rate query params.
   * @returns {Array} Validation middleware chain.
   */
  validateExchangeRate() {
    return [
      query("source")
        .optional()
        .isLength({ min: 3, max: 3 })
        .withMessage("Source currency must be a 3-letter code"),
      query("target")
        .optional()
        .isLength({ min: 3, max: 3 })
        .withMessage("Target currency must be a 3-letter code")
    ];
  }

  /**
   * Returns express-validator chain for the currency conversion body.
   * @returns {Array} Validation middleware chain.
   */
  validateCurrencyConversion() {
    return [
      body("amount")
        .isFloat({ gt: 0 })
        .withMessage("Amount must be a positive number"),
      body("source")
        .optional()
        .isLength({ min: 3, max: 3 })
        .withMessage("Source currency must be a 3-letter code"),
      body("target")
        .optional()
        .isLength({ min: 3, max: 3 })
        .withMessage("Target currency must be a 3-letter code")
    ];
  }

  /**
   * Returns express-validator chain for the rate-history query params.
   * @returns {Array} Validation middleware chain.
   */
  validateRateHistory() {
    return [
      query("source")
        .optional()
        .isLength({ min: 3, max: 3 })
        .withMessage("Source currency must be a 3-letter code"),
      query("target")
        .optional()
        .isLength({ min: 3, max: 3 })
        .withMessage("Target currency must be a 3-letter code"),
      query("startDate")
        .isISO8601()
        .withMessage("Start date must be a valid date"),
      query("endDate")
        .isISO8601()
        .withMessage("End date must be a valid date")
    ];
  }
}

export default new ExchangeRateController();
