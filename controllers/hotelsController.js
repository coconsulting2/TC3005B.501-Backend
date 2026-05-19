/**
 * Búsqueda de hospedaje (Duffel Stays sandbox o mock).
 */
import { body, param } from "express-validator";
import { isStaysAccessDeniedError } from "../services/duffelStaysApi.js";
import { DuffelStaysProvider } from "../services/duffelStaysProvider.js";
import { getActiveHotelProviderLabel, getHotelProvider } from "../services/hotelProvider.js";
import { ResilientHotelProvider } from "../services/resilientHotelProvider.js";

export const validateHotelSearch = [
  body("ciudad").trim().isLength({ min: 2, max: 120 }),
  body("fecha_entrada").matches(/^\d{4}-\d{2}-\d{2}$/),
  body("fecha_salida").matches(/^\d{4}-\d{2}-\d{2}$/),
  body("huespedes").isInt({ min: 1, max: 9 }).toInt(),
];

/**
 * POST /api/hotels/search
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export async function postHotelSearch(req, res) {
  const { ciudad, fecha_entrada: fechaEntrada, fecha_salida: fechaSalida, huespedes } = req.body;
  if (String(fechaEntrada) >= String(fechaSalida)) {
    return res.status(400).json({ error: "fecha_salida debe ser posterior a fecha_entrada" });
  }
  try {
    const provider = getHotelProvider();
    const offers = await provider.searchOffers({
      ciudad,
      fechaEntrada,
      fechaSalida,
      huespedes,
    });
    return res.json({
      offers,
      provider: getActiveHotelProviderLabel(provider),
    });
  } catch (e) {
    console.error("[hotels/search]", e);
    if (isStaysAccessDeniedError(e)) {
      return res.status(503).json({
        error:
          "Duffel Stays no está habilitado en esta cuenta. Contacta a Duffel o usa HOTEL_PROVIDER=mock.",
      });
    }
    return res.status(500).json({ error: e?.message || "Hotel search error" });
  }
}

export const validateHotelFetchRates = [
  param("search_result_id").trim().matches(/^srr_[A-Za-z0-9]+$/),
  body("base_offer").optional().isObject(),
];

/**
 * POST /api/hotels/search-results/:search_result_id/rates
 * Fetch all rates (cuartos/tarifas) para un resultado de búsqueda Duffel.
 * @param req
 * @param res
 */
export async function postHotelFetchRates(req, res) {
  const searchResultId = req.params.search_result_id;
  const baseOffer = req.body?.base_offer ?? null;

  const provider = getHotelProvider();
  if (!(provider instanceof ResilientHotelProvider)) {
    return res.status(400).json({
      error: "fetch_all_rates solo aplica con proveedor Duffel Stays.",
    });
  }

  try {
    const duffel = new DuffelStaysProvider();
    const offer = await duffel.fetchAllRates(searchResultId, baseOffer);
    return res.json({ offer, provider: "duffel" });
  } catch (e) {
    console.error("[hotels/fetch-rates]", e);
    if (isStaysAccessDeniedError(e)) {
      return res.status(503).json({
        error: "Duffel Stays no está habilitado en esta cuenta.",
      });
    }
    return res.status(500).json({ error: e?.message || "No se pudieron obtener las tarifas del hotel" });
  }
}
