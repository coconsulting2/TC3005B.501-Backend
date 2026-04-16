import express from "express";
import exchangeRateController from "../controllers/exchangeRateController.js";

const router = express.Router();

router.get("/rate",
  exchangeRateController.validateExchangeRate(),
  exchangeRateController.getExchangeRate.bind(exchangeRateController)
);

router.post("/convert",
  exchangeRateController.validateCurrencyConversion(),
  exchangeRateController.convertCurrency.bind(exchangeRateController)
);

router.get("/currencies",
  exchangeRateController.getSupportedCurrencies.bind(exchangeRateController)
);

router.get("/history",
  exchangeRateController.validateRateHistory(),
  exchangeRateController.getRateHistory.bind(exchangeRateController)
);

export default router;
