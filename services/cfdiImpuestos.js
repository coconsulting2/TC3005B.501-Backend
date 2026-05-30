/**
 * @module cfdiImpuestos
 * @description Normalización de traslados/retenciones CFDI (c_Impuesto SAT) para persistencia y pólizas GV.
 *
 * Fórmula SAT (CFDI40119): Total = SubTotal − Descuento + ΣTraslados − ΣRetenciones
 * Tolerancia de cuadre: 0.01 MXN (mismo criterio que el PAC al timbrar).
 *
 * Códigos SAT (c_Impuesto): 001 ISR | 002 IVA | 003 IEPS
 */
import { GL_ACCOUNTS } from "../config/accountingCatalogs.js";

/** @typedef {"traslado"|"retencion"} ImpuestoTipo */

/**
 * @typedef {Object} CfdiImpuestoLine
 * @property {string} codigo - "001" | "002" | "003"
 * @property {ImpuestoTipo} tipo
 * @property {number} [base]
 * @property {number} [tasa]
 * @property {number} importe
 * @property {boolean} [acreditable] - solo traslado IVA (002) cuando aplica
 * @property {boolean} [legacyAggregated] - retención inferida sin desglose ISR/IVA
 */

/** Centavos: alineado con validación SAT al timbrar. */
export const AMOUNT_EPSILON = 0.01;

/**
 * Importes monetarios MXN (2 decimales).
 * @param n
 */
export const roundMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Tasas / cuotas (6 decimales, p. ej. 0.160000).
 * @param n
 */
export const roundRate = (n) => Math.round((Number(n) || 0) * 1000000) / 1000000;

/** UsoCFDI donde el IVA trasladado no es acreditable en gastos de viaje. */
const USO_CFDI_IVA_NO_ACREDITABLE = new Set(["S01", "D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10"]);

/**
 * @param {string|number|null|undefined} code
 * @returns {string}
 */
export const normalizeImpuestoCodigo = (code) => {
    const s = String(code ?? "").trim();
    if (/^\d{1,3}$/.test(s)) return s.padStart(3, "0");
    return s;
};

/**
 * IVA trasladado acreditable según UsoCFDI (heurística; reglas LISR adicionales en policy layer).
 * @param {string|undefined|null} usoCfdi
 * @param {string} codigoImpuesto
 * @returns {boolean}
 */
export function isIvaTrasladoAcreditable(usoCfdi, codigoImpuesto) {
    if (normalizeImpuestoCodigo(codigoImpuesto) !== "002") return false;
    const uso = String(usoCfdi ?? "G03")
        .trim()
        .toUpperCase();
    if (USO_CFDI_IVA_NO_ACREDITABLE.has(uso)) return false;
    return true;
}

/**
 * @param {{ traslados?: object[], retenciones?: object[], totalRetenidos?: number|null }} taxes
 * @param {{ usoCfdi?: string }} [options]
 * @returns {CfdiImpuestoLine[]}
 */
export function buildImpuestosFromTaxesBreakdown(taxes, options = {}) {
    const usoCfdi = options.usoCfdi;
    /** @type {CfdiImpuestoLine[]} */
    const out = [];

    for (const t of taxes?.traslados ?? []) {
        const codigo = normalizeImpuestoCodigo(t.impuesto);
        const importeRaw = Number(t.importe);
        if (!Number.isFinite(importeRaw)) continue;
        const importe = roundMoney(importeRaw);
        /** @type {CfdiImpuestoLine} */
        const line = {
            codigo,
            tipo: "traslado",
            importe,
        };
        if (Number.isFinite(t.base)) line.base = roundMoney(t.base);
        if (Number.isFinite(t.tasaOCuota)) line.tasa = roundRate(t.tasaOCuota);
        if (codigo === "002") line.acreditable = isIvaTrasladoAcreditable(usoCfdi, codigo);
        if (codigo === "003") line.acreditable = false;
        out.push(line);
    }

    for (const r of taxes?.retenciones ?? []) {
        const codigo = normalizeImpuestoCodigo(r.impuesto);
        const importeRaw = Number(r.importe);
        if (!Number.isFinite(importeRaw)) continue;
        /** @type {CfdiImpuestoLine} */
        const line = {
            codigo,
            tipo: "retencion",
            importe: roundMoney(importeRaw),
        };
        if (Number.isFinite(r.base)) line.base = roundMoney(r.base);
        if (Number.isFinite(r.tasaOCuota)) line.tasa = roundRate(r.tasaOCuota);
        out.push(line);
    }

    return out;
}

/**
 * @param {CfdiImpuestoLine[]} impuestos
 * @returns {number}
 */
export function sumIvaTrasladadoFromImpuestos(impuestos) {
    return roundMoney(
        (impuestos || [])
            .filter((i) => i.tipo === "traslado" && normalizeImpuestoCodigo(i.codigo) === "002")
            .reduce((s, i) => s + Number(i.importe || 0), 0),
    );
}

/**
 * @param {CfdiImpuestoLine[]} impuestos
 * @returns {number}
 */
export function sumRetencionesFromImpuestos(impuestos) {
    return roundMoney(
        (impuestos || [])
            .filter((i) => i.tipo === "retencion")
            .reduce((s, i) => s + Number(i.importe || 0), 0),
    );
}

/**
 * @param {CfdiImpuestoLine[]} impuestos
 * @returns {boolean}
 */
export function impuestosNeedManualReview(impuestos) {
    return (impuestos || []).some((i) => i.legacyAggregated === true);
}

/**
 * @param {{ subtotal?: number, descuento?: number, iva?: number, total?: number, impuestos?: unknown, totalRetenidos?: number, usoCfdi?: string }} cfdi
 * @returns {CfdiImpuestoLine[]}
 */
export function resolveImpuestosFromComprobante(cfdi) {
    if (Array.isArray(cfdi?.impuestos) && cfdi.impuestos.length > 0) {
        return cfdi.impuestos.map((row) => ({
            codigo: normalizeImpuestoCodigo(row.codigo),
            tipo: row.tipo === "retencion" ? "retencion" : "traslado",
            base: row.base !== undefined && row.base !== null ? roundMoney(row.base) : undefined,
            tasa: row.tasa !== undefined && row.tasa !== null ? roundRate(row.tasa) : undefined,
            importe: roundMoney(row.importe),
            acreditable: row.acreditable,
            legacyAggregated: row.legacyAggregated === true,
        }));
    }

    const usoCfdi = cfdi?.usoCfdi;
    /** @type {CfdiImpuestoLine[]} */
    const legacy = [];
    const iva = roundMoney(cfdi?.iva ?? 0);
    if (iva > 0) {
        legacy.push({
            codigo: "002",
            tipo: "traslado",
            importe: iva,
            acreditable: isIvaTrasladoAcreditable(usoCfdi, "002"),
        });
    }

    // No asignar total_retenidos agregado a IVA (002): rompe ISR+IVA en póliza.
    return inferRetencionesFromTotalsGap(cfdi, legacy);
}

/**
 * Infiere retención agregada solo si falta desglose; marca legacyAggregated para bloquear export hasta re-registrar XML.
 *
 * @param {{ subtotal?: number, descuento?: number, iva?: number, total?: number, totalRetenidos?: number }} cfdi
 * @param {CfdiImpuestoLine[]} impuestos
 * @returns {CfdiImpuestoLine[]}
 */
function inferRetencionesFromTotalsGap(cfdi, impuestos) {
    if (impuestos.some((i) => i.tipo === "retencion")) return impuestos;

    const subtotal = roundMoney(cfdi?.subtotal ?? 0);
    const descuento = roundMoney(cfdi?.descuento ?? 0);
    const traslados = roundMoney(
        impuestos.filter((i) => i.tipo === "traslado").reduce((s, i) => s + i.importe, 0),
    );
    const total = roundMoney(cfdi?.total ?? 0);
    const gap = roundMoney(subtotal - descuento + traslados - total);

    if (gap > AMOUNT_EPSILON) {
        impuestos.push({
            codigo: "002",
            tipo: "retencion",
            importe: gap,
            legacyAggregated: true,
        });
        console.warn(
            "[cfdiImpuestos] Retenciones sin desglose ISR/IVA; re-registre el XML del comprobante. Monto inferido:",
            gap,
        );
    }
    return impuestos;
}

/**
 * @typedef {{ anticipo: string, cxp: string, gasto: string, iva: string, retencionIsr: string, retencionIva: string, ieps: string }} GlCatalogResolved
 */

/**
 * Resuelve cuentas GL: **accountType** (RF-74) tiene prioridad sobre coincidencia por **accountCode**.
 *
 * @param {Array<{ accountCode: string, accountType?: string, active?: boolean }>} accounts
 * @returns {GlCatalogResolved}
 */
export function resolveExtendedGlCatalogFromAccounts(accounts) {
    const sliceCode = (s) => String(s ?? "").trim().slice(0, 10);
    const list = (accounts || []).filter((a) => a.active !== false);
    /** @type {Record<string, string>} */
    const byCode = {};
    /** @type {Record<string, string>} */
    const byType = {};

    for (const a of list) {
        const c = sliceCode(a.accountCode);
        byCode[c] = c;
        const t = String(a.accountType || "").trim();
        if (t) byType[t] = c;
    }

    const pick = (typeKey, defaultCode) => byType[typeKey] ?? byCode[defaultCode] ?? defaultCode;

    return {
        anticipo: pick("Anticipo", GL_ACCOUNTS.ANTICIPO),
        cxp: pick("CxpEmpleado", GL_ACCOUNTS.CUENTA_POR_PAGAR_EMPLEADO),
        gasto: pick("GastoViaje", GL_ACCOUNTS.GASTO_DE_VIAJE),
        iva: pick("Iva", GL_ACCOUNTS.IVA_ACREDITABLE),
        retencionIsr: pick("RetencionIsr", GL_ACCOUNTS.RETENCION_ISR),
        retencionIva: pick("RetencionIva", GL_ACCOUNTS.RETENCION_IVA),
        ieps: pick("Ieps", GL_ACCOUNTS.IEPS),
    };
}

/**
 * @param {{ organization?: { chartOfAccounts?: object[] } }} request
 * @returns {GlCatalogResolved}
 */
export function resolveExtendedGlCatalog(request) {
    return resolveExtendedGlCatalogFromAccounts(request?.organization?.chartOfAccounts);
}

/**
 * Cuenta GL para póliza GV.
 * @param {CfdiImpuestoLine} imp
 * @param {GlCatalogResolved} gl
 * @returns {string}
 * @throws {Error} code UNSUPPORTED_RETENCION_IEPS
 */
export function glAccountForImpuesto(imp, gl) {
    const codigo = normalizeImpuestoCodigo(imp.codigo);
    if (imp.tipo === "retencion") {
        if (codigo === "001") return gl.retencionIsr;
        if (codigo === "002") return gl.retencionIva;
        if (codigo === "003") {
            const err = new Error(
                "Retención IEPS (003) no está soportada en exportación contable por este módulo. Re-clasifique o corrija el CFDI antes de exportarlo.",
            );
            err.code = "UNSUPPORTED_RETENCION_IEPS";
            throw err;
        }
        const err = new Error(`Retención con código SAT ${codigo} no soportada en exportación contable.`);
        err.code = "UNSUPPORTED_RETENCION";
        throw err;
    }
    if (codigo === "003") return gl.ieps;
    if (codigo === "002") {
        if (imp.acreditable === false) return gl.gasto;
        return gl.iva;
    }
    return gl.gasto;
}

/**
 * Valida coherencia SAT: Total = SubTotal − Descuento + ΣTraslados − ΣRetenciones.
 *
 * @param {number} subtotal
 * @param {number} [descuento]
 * @param {CfdiImpuestoLine[]} impuestos
 * @param {number} total
 * @returns {boolean}
 */
export function cfdiTotalsAreCoherent(subtotal, descuento, impuestos, total) {
    const traslados = roundMoney(
        impuestos.filter((i) => i.tipo === "traslado").reduce((s, i) => s + i.importe, 0),
    );
    const retenciones = sumRetencionesFromImpuestos(impuestos);
    const expected = roundMoney(roundMoney(subtotal) - roundMoney(descuento || 0) + traslados - retenciones);
    return Math.abs(expected - roundMoney(total)) <= AMOUNT_EPSILON;
}

/**
 * Base de gasto para línea Debe: SubTotal − Descuento (base gravable antes de impuestos).
 * @param {{ subtotal?: number, descuento?: number }} cfdi
 * @returns {number}
 */
export function resolveGastoBaseFromComprobante(cfdi) {
    return roundMoney(roundMoney(cfdi?.subtotal ?? 0) - roundMoney(cfdi?.descuento ?? 0));
}
