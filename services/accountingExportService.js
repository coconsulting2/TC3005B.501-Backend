/**
 * @module accountingExportService
 * @description Construye polizas contables (AV / GV) a partir de Requests reales y
 * las serializa a JSON o XML para que el ERP las consuma.
 *
 * Formato de referencia: /Users/mvrer/Downloads/Polizas contables gastos de Viaje.xlsx
 *   - Poliza Anticipo de Viaje (DOC_TYPE=AV)
 *   - Poliza Comprobacion de Viaje con anticipo (DOC_TYPE=GV)
 *   - Poliza Gasto de Viaje sin Anticipo (DOC_TYPE=GV)
 *
 * Catálogo GL/COMP_CODE: `polizaCatalogService` + tablas RF-74 por organización (fallback `accountingCatalogs.js`).
 * `ACCOUNTING_EXPORT_STRICT_LENGTHS=1`: rechaza campos que excedan longitud SAP (sin truncar silenciosamente).
 */
import { XMLBuilder } from "fast-xml-parser";
import prisma from "../database/config/prisma.js";
import AccountingExport from "../models/accountingExportModel.js";
import AccountingPolizaModel from "../models/accountingPolizaModel.js";
import {
    DOC_TYPES,
    SHKZG,
    proveedorFromUserId,
} from "../config/accountingCatalogs.js";
import { resolveGlCatalog, resolveCompCode, costCenterRequiredAccountsFor } from "./polizaCatalogService.js";
import {
    resolveExtendedGlCatalog,
    resolveImpuestosFromComprobante,
    resolveGastoBaseFromComprobante,
    glAccountForImpuesto,
    normalizeImpuestoCodigo,
    impuestosNeedManualReview,
    roundMoney,
} from "./cfdiImpuestos.js";
import { fetchBanxicoUsdMxnFixing } from "./banxicoService.js";

const MXN = "MXN";
const AMOUNT_EPSILON = 0.001;
const MAX_LEN = {
    ID_VIAJE: 10,
    COMP_CODE: 4,
    CURRENCY: 5,
    HEADER_TXT: 25,
    GL_ACCOUNT: 10,
    COSTCENTER: 10,
    VENDOR_NO: 11,
    ITEM_TEXT: 50,
};

/**
 * Si true, longitudes SAP estrictas (400 en vez de truncar).
 * @returns {boolean}
 */
export const isAccountingExportStrictLengths = () =>
    process.env.ACCOUNTING_EXPORT_STRICT_LENGTHS === "1" ||
    String(process.env.ACCOUNTING_EXPORT_STRICT_LENGTHS || "").toLowerCase() === "true";

/**
 * Error thrown when a required resource is missing (HTTP 404).
 */
class NotFoundError extends Error {
    /**
     * @param {string} message Human-readable error message.
     */
    constructor(message) {
        super(message);
        this.status = 404;
    }
}

/**
 * Error thrown when the request conflicts with current state (HTTP 409).
 */
class ConflictError extends Error {
    /**
     * @param {string} message Human-readable error message.
     */
    constructor(message) {
        super(message);
        this.status = 409;
    }
}

/**
 * Error thrown when the accounting payload is not valid for export (HTTP 400).
 */
class ValidationError extends Error {
    /**
     * @param {string} message Human-readable error message.
     */
    constructor(message) {
        super(message);
        this.status = 400;
    }
}

/**
 * Redondea a 4 decimales (formato SAP AMT_DOCCUR N(23,4)).
 * @param {number} n
 * @returns {number}
 */
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const toIsoDate = (d) => new Date(d).toISOString().slice(0, 10);
const cut = (v, n) => String(v ?? "").trim().slice(0, n);
const detailLinesFrom = (poliza) => poliza.detalle || poliza.detalles || [];

/**
 * @param {string} fieldName
 * @param {unknown} value
 * @param {number} max
 * @param {boolean} strict
 * @returns {string}
 */
const normalizeStr = (fieldName, value, max, strict) => {
    const s = String(value ?? "").trim();
    if (strict && s.length > max) {
        throw new ValidationError(`${fieldName} exceeds max length ${max} (SAP)`);
    }
    return s.slice(0, max);
};

/**
 * @param {Object} header
 * @param {boolean} strict
 * @returns {Object}
 */
const normalizeHeader = (header, strict) => {
    const normalized = {
        ID_VIAJE: normalizeStr("ID_VIAJE", header.ID_VIAJE, MAX_LEN.ID_VIAJE, strict),
        DOC_TYPE: normalizeStr("DOC_TYPE", header.DOC_TYPE, 2, strict),
        HEADER_TXT: normalizeStr("HEADER_TXT", header.HEADER_TXT, MAX_LEN.HEADER_TXT, strict),
        COMP_CODE: normalizeStr("COMP_CODE", header.COMP_CODE, MAX_LEN.COMP_CODE, strict),
        PSTNG_DATE: toIsoDate(header.PSTNG_DATE || new Date()),
        CURRENCY: normalizeStr("CURRENCY", header.CURRENCY || MXN, MAX_LEN.CURRENCY, strict) || MXN,
        EXCH_RATE: round4(header.EXCH_RATE || 1),
    };
    if (!normalized.ID_VIAJE) throw new ValidationError("ID_VIAJE is required");
    if (!normalized.DOC_TYPE) throw new ValidationError("DOC_TYPE is required");
    if (!normalized.COMP_CODE) throw new ValidationError("COMP_CODE is required");
    return normalized;
};

/**
 * @param {Object} line
 * @param {boolean} strict
 * @param {Set<string>} costCenterRequiredGls
 * @returns {Object}
 */
const normalizeLine = (line, strict, costCenterRequiredGls) => {
    const normalized = {
        ITEMNO_ACC: Number(line.ITEMNO_ACC),
        SHKZG: line.SHKZG,
        GL_ACCOUNT: normalizeStr("GL_ACCOUNT", line.GL_ACCOUNT, MAX_LEN.GL_ACCOUNT, strict),
        ITEM_TEXT: normalizeStr("ITEM_TEXT", line.ITEM_TEXT, MAX_LEN.ITEM_TEXT, strict),
        AMT_DOCCUR: round4(line.AMT_DOCCUR),
    };

    const costcenter = normalizeStr("COSTCENTER", line.COSTCENTER, MAX_LEN.COSTCENTER, strict);
    const vendorNo = normalizeStr("VENDOR_NO", line.VENDOR_NO, MAX_LEN.VENDOR_NO, strict);
    if (costcenter) normalized.COSTCENTER = costcenter;
    if (vendorNo) normalized.VENDOR_NO = vendorNo;

    if (normalized.SHKZG !== SHKZG.DEBE && normalized.SHKZG !== SHKZG.HABER) {
        throw new ValidationError(`Invalid SHKZG at ITEMNO_ACC ${normalized.ITEMNO_ACC}`);
    }
    if (!normalized.GL_ACCOUNT) {
        throw new ValidationError(`GL_ACCOUNT is required at ITEMNO_ACC ${normalized.ITEMNO_ACC}`);
    }
    if (costCenterRequiredGls.has(normalized.GL_ACCOUNT) && !normalized.COSTCENTER) {
        throw new ValidationError(`COSTCENTER is required for account ${normalized.GL_ACCOUNT}`);
    }
    if (!Number.isFinite(normalized.AMT_DOCCUR) || normalized.AMT_DOCCUR <= 0) {
        throw new ValidationError(`AMT_DOCCUR must be > 0 at ITEMNO_ACC ${normalized.ITEMNO_ACC}`);
    }
    return normalized;
};

/**
 * @param {Object} poliza
 * @param {boolean} strict
 * @param {Set<string>} costCenterRequiredGls
 * @returns {Object}
 */
const normalizeAndValidatePoliza = (poliza, strict, costCenterRequiredGls) => {
    const detalle = detailLinesFrom(poliza).map((l) => normalizeLine(l, strict, costCenterRequiredGls));
    if (detalle.length === 0) {
        throw new ValidationError("Poliza must include at least one detail line");
    }
    const header = normalizeHeader(poliza.header || {}, strict);
    const debe = round4(detalle.filter((d) => d.SHKZG === SHKZG.DEBE).reduce((s, d) => s + d.AMT_DOCCUR, 0));
    const haber = round4(detalle.filter((d) => d.SHKZG === SHKZG.HABER).reduce((s, d) => s + d.AMT_DOCCUR, 0));
    if (Math.abs(debe - haber) > AMOUNT_EPSILON) {
        throw new ValidationError(`Poliza ${header.ID_VIAJE} is unbalanced: debe=${debe} haber=${haber}`);
    }
    return { header, detalle };
};

/**
 * @param {object} request Prisma request con user.empleado opcional
 * @returns {{ vendorNo: string, costCenter: string }}
 */
export const resolveVendorAndCostCenter = (request) => {
    const emp = request?.user?.empleado;
    const vendorNo =
        emp?.proveedor !== undefined && emp?.proveedor !== null && String(emp.proveedor).trim()
            ? String(emp.proveedor).trim()
            : proveedorFromUserId(Number(request.userId));
    const costCenter =
        (emp?.ceco !== undefined &&
            emp?.ceco !== null &&
            String(emp.ceco).trim() &&
            String(emp.ceco).trim()) ||
        (request.user?.department?.costsCenter && String(request.user.department.costsCenter).trim()) ||
        "";
    return { vendorNo, costCenter };
};

/**
 * @param {Array<Object>} receipts
 * @param {string} pstngDateIso YYYY-MM-DD
 * @returns {Promise<{ currency: string, exchRate: number }>}
 */
const resolveCurrencyAndRate = async (receipts, pstngDateIso) => {
    const withCfdi = receipts.find((r) => r.cfdiComprobante);
    if (!withCfdi) return { currency: MXN, exchRate: 1 };
    const c = withCfdi.cfdiComprobante;
    const currency = c.moneda || MXN;
    if (currency === MXN) return { currency: MXN, exchRate: 1 };
    if (currency === "USD") {
        const fromBanxico = await fetchBanxicoUsdMxnFixing(pstngDateIso);
        if (typeof fromBanxico === "number") return { currency, exchRate: round4(fromBanxico) };
    }
    return { currency, exchRate: round4(Number(c.tipoCambio) || 1) };
};

/**
 * Construye la poliza AV (anticipo) para un importe de anticipo explícito.
 *
 * @param {object} request Request o mínimo { requestId, userId, user?, organization? }
 * @param {number} advanceAmount importe del anticipo (> 0)
 * @returns {Object|null} Poliza en formato plano (cabecera + detalles), o null si el monto no aplica.
 */
export const buildAnticipoPolizaForAdvance = (request, advanceAmount) => {
    const amount = round4(advanceAmount);
    if (amount <= 0) return null;

    const gl = resolveGlCatalog(request);
    const comp = resolveCompCode(request);
    const { vendorNo } = resolveVendorAndCostCenter(request);

    const empCode = `Emp${String(request.userId).padStart(3, "0")}`;
    const today = new Date();

    const header = {
        ID_VIAJE: String(request.requestId),
        DOC_TYPE: DOC_TYPES.ANTICIPO_VIAJE,
        HEADER_TXT: `Anticipo Viaje # ${request.requestId}`,
        COMP_CODE: comp,
        PSTNG_DATE: toIsoDate(today),
        CURRENCY: MXN,
        EXCH_RATE: 1,
    };

    const itemText = `Anticipo Viaje # ${request.requestId} #${empCode}`;
    const detalle = [
        {
            ITEMNO_ACC: 1,
            SHKZG: SHKZG.DEBE,
            GL_ACCOUNT: gl.anticipo,
            VENDOR_NO: vendorNo,
            ITEM_TEXT: itemText,
            AMT_DOCCUR: amount,
        },
        {
            ITEMNO_ACC: 2,
            SHKZG: SHKZG.HABER,
            GL_ACCOUNT: gl.cxp,
            VENDOR_NO: vendorNo,
            ITEM_TEXT: itemText,
            AMT_DOCCUR: amount,
        },
    ];

    return { header, detalle };
};

/**
 * Poliza AV usando imposed_fee del Request (export ERP al finalizar).
 * @param {Object} request
 * @returns {Object|null}
 */
const buildAnticipoPoliza = (request) =>
    buildAnticipoPolizaForAdvance(request, Number(request.imposedFee || 0));

/**
 * @param {Object} request
 * @param {boolean} hasAnticipo
 * @returns {Promise<Object|null>}
 */
const buildComprobacionPoliza = async (request, hasAnticipo) => {
    const receipts = (request.receipts || []).filter((r) => r.cfdiComprobante);
    if (receipts.length === 0) return null;

    const gl = resolveExtendedGlCatalog(request);
    const comp = resolveCompCode(request);
    const { vendorNo, costCenter } = resolveVendorAndCostCenter(request);

    const lastValidation = receipts
        .map((r) => r.validationDate)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    const pstngDate = toIsoDate(lastValidation ? new Date(lastValidation) : new Date());
    const { currency, exchRate } = await resolveCurrencyAndRate(receipts, pstngDate);

    const headerText = hasAnticipo
        ? `Comprobacion Viaje # ${request.requestId}`
        : `Gasto sin Anticipo # ${request.requestId}`;

    const header = {
        ID_VIAJE: String(request.requestId),
        DOC_TYPE: DOC_TYPES.GASTO_VIAJE,
        HEADER_TXT: cut(headerText, 25),
        COMP_CODE: comp,
        PSTNG_DATE: pstngDate,
        CURRENCY: currency,
        EXCH_RATE: exchRate,
    };

    const detalle = [];
    let itemNo = 1;
    let totalAcum = 0;

    for (const r of receipts) {
        const c = r.cfdiComprobante;
        const impuestos = resolveImpuestosFromComprobante(c);
        if (impuestosNeedManualReview(impuestos)) {
            throw new ValidationError(
                `Receipt ${r.receiptId}: retenciones sin desglose ISR/IVA. Vuelva a registrar el XML del CFDI.`,
            );
        }
        const gastoBase = resolveGastoBaseFromComprobante(c);
        const total = roundMoney(c.total);
        const text = (r.receiptType?.receiptTypeName
            ? `Comprobacion ${r.receiptType.receiptTypeName}`
            : `Comprobacion Receipt ${r.receiptId}`).slice(0, 50);

        const gastoGl =
            (r.receiptType?.gastoGlAccountCode && String(r.receiptType.gastoGlAccountCode).trim().slice(0, 10)) ||
            gl.gasto;
        const ivaGlOverride =
            r.receiptType?.ivaGlAccountCode && String(r.receiptType.ivaGlAccountCode).trim().slice(0, 10);

        if (gastoBase > 0) {
            detalle.push({
                ITEMNO_ACC: itemNo++,
                SHKZG: SHKZG.DEBE,
                GL_ACCOUNT: gastoGl,
                COSTCENTER: costCenter,
                ITEM_TEXT: text,
                AMT_DOCCUR: gastoBase,
            });
        }

        for (const imp of impuestos) {
            if (imp.tipo !== "traslado" || imp.importe <= 0) continue;
            let glAccount;
            try {
                glAccount = glAccountForImpuesto(imp, gl);
            } catch (err) {
                throw new ValidationError(
                    err?.message || `Impuesto no soportado en receipt ${r.receiptId}`,
                );
            }
            if (normalizeImpuestoCodigo(imp.codigo) === "002" && ivaGlOverride && imp.acreditable !== false) {
                glAccount = ivaGlOverride;
            }
            if (glAccount === gl.gasto) {
                glAccount = gastoGl;
            }
            const line = {
                ITEMNO_ACC: itemNo++,
                SHKZG: SHKZG.DEBE,
                GL_ACCOUNT: glAccount,
                ITEM_TEXT: text,
                AMT_DOCCUR: roundMoney(imp.importe),
            };
            if (glAccount === gastoGl) line.COSTCENTER = costCenter;
            detalle.push(line);
        }

        for (const imp of impuestos) {
            if (imp.tipo !== "retencion" || imp.importe <= 0) continue;
            let glAccount;
            try {
                glAccount = glAccountForImpuesto(imp, gl);
            } catch (err) {
                throw new ValidationError(
                    err?.message || `Retención no soportada en receipt ${r.receiptId}`,
                );
            }
            const retLabel =
                normalizeImpuestoCodigo(imp.codigo) === "001"
                    ? "Ret ISR"
                    : normalizeImpuestoCodigo(imp.codigo) === "002"
                      ? "Ret IVA"
                      : "Retencion";
            detalle.push({
                ITEMNO_ACC: itemNo++,
                SHKZG: SHKZG.HABER,
                GL_ACCOUNT: glAccount,
                ITEM_TEXT: `${retLabel} ${text}`.slice(0, 50),
                AMT_DOCCUR: roundMoney(imp.importe),
            });
        }

        totalAcum += total;
    }

    const haberGl = hasAnticipo ? gl.anticipo : gl.cxp;
    const haberText = (receipts[0]?.receiptType?.receiptTypeName
        ? `Comprobacion ${receipts[0].receiptType.receiptTypeName}`
        : `Comprobacion Viaje ${request.requestId}`).slice(0, 50);

    detalle.push({
        ITEMNO_ACC: itemNo++,
        SHKZG: SHKZG.HABER,
        GL_ACCOUNT: haberGl,
        VENDOR_NO: vendorNo,
        ITEM_TEXT: haberText,
        AMT_DOCCUR: round4(totalAcum),
    });

    return { header, detalle };
};

/**
 * Cuentas Debe que exigen CeCo: GL base del catálogo + overrides `gastoGlAccountCode` en receipts con CFDI.
 * @param {object} request
 * @param {object} gl
 * @returns {Set<string>}
 */
const costCenterRequiredGlsForRequest = (request, gl) => {
    const combined = new Set(costCenterRequiredAccountsFor(gl));
    for (const r of request.receipts || []) {
        if (!r?.cfdiComprobante) continue;
        const raw = r.receiptType?.gastoGlAccountCode;
        if (raw === undefined || raw === null || String(raw).trim() === "") continue;
        combined.add(String(raw).trim().slice(0, 10));
    }
    return combined;
};

/**
 * @param {Object} request
 * @returns {Promise<Array<{ header: object, detalle: object[] }>>}
 */
const buildPolizasFromRequest = async (request) => {
    const strict = isAccountingExportStrictLengths();
    const gl = resolveGlCatalog(request);
    const costGls = costCenterRequiredGlsForRequest(request, gl);
    const polizas = [];
    const hasAnticipo = Number(request.imposedFee || 0) > 0;

    if (hasAnticipo) {
        const av = buildAnticipoPoliza(request);
        if (av) polizas.push(normalizeAndValidatePoliza(av, strict, costGls));
    }

    const comprobacion = await buildComprobacionPoliza(request, hasAnticipo);
    if (comprobacion) polizas.push(normalizeAndValidatePoliza(comprobacion, strict, costGls));

    return polizas;
};

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} request
 * @param {object[]} polizas
 * @param {boolean} requestMarkedExported
 * @returns {Promise<void>}
 */
const persistPolizasTx = async (tx, request, polizas, requestMarkedExported) => {
    if (polizas.length > 0) {
        await tx.accountingPoliza.createMany({
            data: polizas.map((p, idx) => ({
                organizationId: request.organizationId,
                requestId: request.requestId,
                polizaIndex: idx,
                docType: String(p.header?.DOC_TYPE || "").slice(0, 2),
                payload: p,
                requestMarkedExported: Boolean(requestMarkedExported),
            })),
        });
    }
};

const xmlBuilder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: true,
    arrayNodeName: "Detalle",
});

/**
 * Serializa una lista de polizas a XML (root <Polizas>).
 * @param {Array<Object>} polizas
 * @returns {string}
 */
const polizasToXml = (polizas) => {
    const payload = {
        Polizas: {
            Poliza: polizas.map((p) => ({
                Cabecera: p.header,
                Detalles: { Detalle: detailLinesFrom(p) },
            })),
        },
    };
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlBuilder.build(payload);
};

const AccountingExportService = {
    /**
     * Obtiene y arma las polizas de UN Request finalizado, las persiste y marca el viaje exportado.
     * @param {number} requestId
     * @returns {Promise<Array<Object>>}
     * @throws {NotFoundError|ConflictError}
     */
    async getPolizasForRequest(requestId) {
        const request = await AccountingExport.getRequestForExport(requestId);
        if (!request) throw new NotFoundError("Travel request not found");
        if (request.requestStatusId !== 8) {
            throw new ConflictError(
                "Request not finalized. Accounting export is only available once the request is in status 'Finalizado'."
            );
        }
        const polizas = await buildPolizasFromRequest(request);
        await prisma.$transaction(async (tx) => {
            await persistPolizasTx(tx, request, polizas, true);
            await tx.request.updateMany({
                where: { requestId: request.requestId },
                data: { isExported: true, exportedAt: new Date() },
            });
        });
        return polizas;
    },

    /**
     * Obtiene y arma las polizas de todos los Requests finalizados con validaciones en el rango [from, to].
     * @param {Date} from
     * @param {Date} to
     * @param {Object} [options]
     * @param {boolean} [options.force=false]
     * @returns {Promise<Array<Object>>}
     */
    async getPolizasInRange(from, to, { force = false } = {}) {
        const requests = await AccountingExport.getFinalizedRequestsInRange(from, to, force);
        const built = [];
        for (const r of requests) {
            built.push({ request: r, polizas: await buildPolizasFromRequest(r) });
        }
        const flatPolizas = built.flatMap((b) => b.polizas);
        if (requests.length > 0) {
            await prisma.$transaction(async (tx) => {
                for (const { request, polizas } of built) {
                    await persistPolizasTx(tx, request, polizas, true);
                }
                await tx.request.updateMany({
                    where: { requestId: { in: requests.map((r) => r.requestId) } },
                    data: { isExported: true, exportedAt: new Date() },
                });
            });
        }
        return flatPolizas;
    },

    /**
     * Genera y persiste pólizas sin marcar el Request como exportado (previsualización / ERP externo).
     * @param {number} requestId
     * @returns {Promise<object[]>}
     */
    async generatePolizasForRequest(requestId) {
        const request = await AccountingExport.getRequestForExport(requestId);
        if (!request) throw new NotFoundError("Travel request not found");
        if (request.requestStatusId !== 8) {
            throw new ConflictError(
                "Request not finalized. Poliza generation is only available once the request is in status 'Finalizado'."
            );
        }
        const polizas = await buildPolizasFromRequest(request);
        await AccountingPolizaModel.insertPolizasForRequest({
            organizationId: request.organizationId,
            requestId: request.requestId,
            polizas,
            requestMarkedExported: false,
        });
        return polizas;
    },

    polizasToXml,
    NotFoundError,
    ConflictError,
    ValidationError,
};

export default AccountingExportService;
