/**
 * @module polizaCatalogService
 * @description Resuelve COMP_CODE y cuentas GL desde el catálogo contable por organización (RF-74),
 * con fallback a los defaults de `accountingCatalogs.js`.
 */
import { GL_ACCOUNTS, SOCIEDAD_DEFAULT } from "../config/accountingCatalogs.js";

/**
 * @typedef {{ anticipo: string, cxp: string, gasto: string, iva: string }} GlCatalogResolved
 */

const sliceCode = (s) => String(s ?? "").trim().slice(0, 10);

/**
 * @param {Array<{ accountCode: string, accountName?: string, accountType?: string, active?: boolean }>} accounts
 * @returns {GlCatalogResolved}
 */
export function resolveGlCatalogFromAccounts(accounts) {
    const list = (accounts || []).filter((a) => a.active !== false);
    /** @type {GlCatalogResolved} */
    const out = {
        anticipo: GL_ACCOUNTS.ANTICIPO,
        cxp: GL_ACCOUNTS.CUENTA_POR_PAGAR_EMPLEADO,
        gasto: GL_ACCOUNTS.GASTO_DE_VIAJE,
        iva: GL_ACCOUNTS.IVA_ACREDITABLE,
    };
    for (const a of list) {
        const c = sliceCode(a.accountCode);
        if (c === GL_ACCOUNTS.ANTICIPO) out.anticipo = c;
        else if (c === GL_ACCOUNTS.CUENTA_POR_PAGAR_EMPLEADO) out.cxp = c;
        else if (c === GL_ACCOUNTS.GASTO_DE_VIAJE) out.gasto = c;
        else if (c === GL_ACCOUNTS.IVA_ACREDITABLE) out.iva = c;
    }
    for (const a of list) {
        const t = String(a.accountType || "").trim();
        const c = sliceCode(a.accountCode);
        if (t === "Anticipo") out.anticipo = c;
        else if (t === "CxpEmpleado") out.cxp = c;
        else if (t === "GastoViaje") out.gasto = c;
        else if (t === "Iva") out.iva = c;
    }
    return out;
}

/**
 * @param {{ organization?: { chartOfAccounts?: object[] } }} request
 * @returns {GlCatalogResolved}
 */
export function resolveGlCatalog(request) {
    return resolveGlCatalogFromAccounts(request?.organization?.chartOfAccounts);
}

/**
 * @param {Array<{ code: string }>|undefined} societies
 * @returns {string} COMP_CODE SAP C(4)
 */
export function resolveCompCodeFromSocieties(societies) {
    const list = [...(societies || [])].sort((a, b) => String(a.code).localeCompare(String(b.code)));
    if (!list.length) return String(SOCIEDAD_DEFAULT).trim().slice(0, 4);
    const first = String(list[0].code ?? "").trim();
    return first.slice(0, 4) || String(SOCIEDAD_DEFAULT).trim().slice(0, 4);
}

/**
 * @param {{ organization?: { accountingSocieties?: object[] } }} request
 * @returns {string}
 */
export function resolveCompCode(request) {
    return resolveCompCodeFromSocieties(request?.organization?.accountingSocieties);
}

/**
 * Cuentas cuya línea Debe requiere centro de costos (gasto P&L).
 * @param {GlCatalogResolved} gl
 * @returns {Set<string>}
 */
export function costCenterRequiredAccountsFor(gl) {
    return new Set([gl.gasto]);
}
