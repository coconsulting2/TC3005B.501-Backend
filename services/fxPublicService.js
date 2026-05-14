/**
 * Conversión pública a MXN vía Frankfurter (ECB, sin API key).
 * Cache en memoria por día y par (from, to).
 */
/* global fetch */
const cache = new Map();

/**
 *
 * @param from
 * @param to
 */
function cacheKey(from, to) {
  const day = new Date().toISOString().slice(0, 10);
  return `${day}|${from}|${to}`;
}

/**
 * @param {string} from - ISO 4217
 * @param {string} to - ISO 4217
 * @returns {Promise<number>} tipo de cambio: 1 `from` = rate `to`
 */
export async function getFxRateToTarget(from, to) {
  const f = String(from || "").toUpperCase().trim();
  const t = String(to || "").toUpperCase().trim();
  if (!/^[A-Z]{3}$/.test(f) || !/^[A-Z]{3}$/.test(t)) {
    throw new Error("Invalid currency codes");
  }
  if (f === t) return 1;

  const key = cacheKey(f, t);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < 24 * 60 * 60 * 1000) {
    return hit.rate;
  }

  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FX provider error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const rate = data?.rates?.[t];
  if (typeof rate !== "number" || Number.isNaN(rate)) {
    throw new Error("FX response missing rate");
  }
  cache.set(key, { rate, ts: Date.now() });
  return rate;
}

/**
 * @param {string} from
 * @param {string} to
 * @param {number} amount
 * @returns {Promise<{ from: string, to: string, amount: number, rate: number, converted: number, rateDate: string, fromCache: boolean }>}
 */
export async function convertAmount(from, to, amount) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) {
    throw new Error("amount must be a non-negative number");
  }
  const key = cacheKey(String(from).toUpperCase(), String(to).toUpperCase());
  const had = cache.has(key);
  const rate = await getFxRateToTarget(from, to);
  return {
    from: String(from).toUpperCase(),
    to: String(to).toUpperCase(),
    amount: amt,
    rate,
    converted: amt * rate,
    rateDate: new Date().toISOString().slice(0, 10),
    fromCache: had,
  };
}
