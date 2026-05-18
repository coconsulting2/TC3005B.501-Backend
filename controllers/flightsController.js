/**
 * @module flightsController
 * @description Búsqueda de vuelos (Duffel o mock) — TF-010.
 */
import { body } from "express-validator";
import { getFlightProvider } from "../services/flightProvider.js";
import { MockFlightProvider } from "../services/mockFlightProvider.js";

export const validateFlightSearch = [
  body("origen").isLength({ min: 3, max: 3 }).isAlpha().toUpperCase(),
  body("destino").isLength({ min: 3, max: 3 }).isAlpha().toUpperCase(),
  body("fecha").matches(/^\d{4}-\d{2}-\d{2}$/),
  body("fecha_regreso")
    .optional({ values: "null" })
    .matches(/^\d{4}-\d{2}-\d{2}$/),
  body("pasajeros").isInt({ min: 1, max: 9 }).toInt(),
];

/**
 * POST /api/flights/search
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export async function postFlightSearch(req, res) {
  const params = {
    origin: req.body.origen,
    destination: req.body.destino,
    departureDate: req.body.fecha,
    returnDate: req.body.fecha_regreso || undefined,
    passengers: req.body.pasajeros,
  };
  try {
    const provider = getFlightProvider();
    const offers = await provider.searchOffers(params);
    return res.json({
      offers,
      provider: String(process.env.FLIGHT_PROVIDER || "mock").toLowerCase(),
    });
  } catch (e) {
    const useDuffel = String(process.env.FLIGHT_PROVIDER || "").toLowerCase() === "duffel";
    if (useDuffel) {
      console.warn("[flights/search] Duffel error, fallback mock:", e?.message || e);
      try {
        const mock = new MockFlightProvider();
        const offers = await mock.searchOffers(params);
        return res.json({ offers, provider: "mock", fallback: true });
      } catch (e2) {
        console.error("[flights/search] mock fallback failed:", e2);
      }
    }
    console.error("[flights/search]", e);
    return res.status(500).json({ error: e?.message || "Flight search error" });
  }
}
