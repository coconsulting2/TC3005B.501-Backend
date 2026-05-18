/**
 * Llamadas HTTP a Duffel Stays (v2). Radio de búsqueda en kilómetros (1–100).
 * @see https://duffel.com/docs/api/v2/search/stays-search
 */

const DUFFEL_API = "https://api.duffel.com";

/**
 * @returns {string}
 */
function getDuffelToken() {
  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("DUFFEL_ACCESS_TOKEN is not configured");
  }
  return token;
}

/**
 * @param {number} km
 * @returns {number}
 */
export function clampStaysSearchRadiusKm(km) {
  const n = Number(km);
  if (!Number.isFinite(n)) return 10;
  return Math.min(100, Math.max(1, Math.round(n)));
}

/**
 * @param {string} bodyText
 * @returns {string}
 */
function parseDuffelErrorBody(bodyText) {
  if (!bodyText) return "";
  try {
    const json = JSON.parse(bodyText);
    const errs = json?.errors;
    if (Array.isArray(errs) && errs.length > 0) {
      return errs.map((e) => e?.message || e?.title || "").filter(Boolean).join("; ");
    }
    if (typeof json?.error === "string") return json.error;
  } catch {
    /* texto plano */
  }
  return bodyText.trim().slice(0, 500);
}

/**
 * @param {Response} res
 * @param {string} bodyText
 */
function throwDuffelHttpError(res, bodyText) {
  const message = parseDuffelErrorBody(bodyText) || `Duffel Stays HTTP ${res.status}`;
  const err = new Error(message);
  err.status = res.status;
  err.staysNotEnabled =
    res.status === 403 ||
    /not enabled/i.test(message) ||
    /contact sales/i.test(message);
  throw err;
}

/**
 * @param {string} path
 * @param {import("node-fetch").RequestInit} init
 */
async function duffelFetch(path, init = {}) {
  const token = getDuffelToken();
  const res = await fetch(`${DUFFEL_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Duffel-Version": "v2",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const bodyText = await res.text();
  if (!res.ok) {
    throwDuffelHttpError(res, bodyText);
  }
  if (!bodyText) return {};
  return JSON.parse(bodyText);
}

/**
 * @param {object} params
 * @param {{ latitude: number; longitude: number }} params.coordinates
 * @param {number} [params.radiusKm]
 * @param {string} params.checkInDate
 * @param {string} params.checkOutDate
 * @param {number} params.rooms
 * @param {Array<{ type: string; age?: number }>} params.guests
 * @returns {Promise<{ data: { results?: unknown[] } }>}
 */
export async function staysSearch({
  coordinates,
  radiusKm = 10,
  checkInDate,
  checkOutDate,
  rooms = 1,
  guests,
}) {
  const radius = clampStaysSearchRadiusKm(radiusKm);
  return duffelFetch("/stays/search", {
    method: "POST",
    body: JSON.stringify({
      data: {
        location: {
          radius,
          geographic_coordinates: {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
          },
        },
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        rooms,
        guests,
      },
    }),
  });
}

/**
 * @param {string} searchResultId - srr_...
 * @returns {Promise<{ data: unknown }>}
 */
export async function staysFetchAllRates(searchResultId) {
  const id = String(searchResultId || "").trim();
  if (!id) {
    throw new Error("search_result_id requerido");
  }
  return duffelFetch(`/stays/search_results/${encodeURIComponent(id)}/actions/fetch_all_rates`, {
    method: "POST",
    body: JSON.stringify({ data: {} }),
  });
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isStaysAccessDeniedError(err) {
  if (!err || typeof err !== "object") return false;
  if ("staysNotEnabled" in err && err.staysNotEnabled) return true;
  const status = /** @type {{ status?: number }} */ (err).status;
  if (status === 403) return true;
  const msg = String(/** @type {{ message?: string }} */ (err).message || "");
  return /not enabled/i.test(msg) || /contact sales/i.test(msg);
}
