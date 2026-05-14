/**
 * Búsqueda de hospedaje (Duffel Stays sandbox o mock si HOTEL_PROVIDER=mock).
 */
import { body } from "express-validator";
import { getActiveHotelProviderLabel, getHotelProvider } from "../services/hotelProvider.js";

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
      provider: getActiveHotelProviderLabel(),
    });
  } catch (e) {
    console.error("[hotels/search]", e);
    return res.status(500).json({ error: e?.message || "Hotel search error" });
  }
}
