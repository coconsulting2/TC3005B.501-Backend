/**
 * @module banxicoService
 * @description Tipo de cambio FIX USD/MXN (serie Banxico SF43718) para EXCH_RATE en pólizas.
 * Requiere token opcional `BANXICO_API_TOKEN` o `BANXICO_TOKEN` para SieAPIRest.
 * Desactivar: `BANXICO_DISABLE=1` o `NODE_ENV=test`.
 */
/* global fetch, AbortController */

const SF43718 = "SF43718";

/**
 * @param {string} isoDateYmd Fecha "YYYY-MM-DD" (fecha contable PSTNG_DATE).
 * @returns {Promise<number|null>} FIX diario USD→MXN o null si no disponible.
 */
export async function fetchBanxicoUsdMxnFixing(isoDateYmd) {
    if (process.env.NODE_ENV === "test" || process.env.BANXICO_DISABLE === "1") return null;
    const fecha = String(isoDateYmd || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
    const token = process.env.BANXICO_API_TOKEN || process.env.BANXICO_TOKEN || process.env.BANXICO_API_KEY;
    const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${SF43718}/datos/${fecha}/${fecha}`;
    try {
        /** @type {Record<string, string>} */
        const headers = {};
        if (token) headers["Bmx-Token"] = token;
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(url, { headers, signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) return null;
        const json = await res.json();
        const datos = json?.bmx?.series?.[0]?.datos;
        const row = Array.isArray(datos) ? datos[0] : null;
        const dato = row?.dato;
        if (dato === undefined || dato === null) return null;
        const n = Number(String(dato).replace(/,/g, ""));
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}
