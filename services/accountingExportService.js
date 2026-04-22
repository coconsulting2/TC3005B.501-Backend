/**
 * @module accountingExportService
 * @description Construye polizas contables (AV / GV) a partir de Requests reales y
 * las serializa a JSON o XML para que el ERP las consuma.
 *
 * Formato de referencia: /Users/mvrer/Downloads/Polizas contables gastos de Viaje.xlsx
 *   - Poliza Anticipo de Viaje (DOC_TYPE=AV)
 *   - Poliza Comprobacion de Viaje con anticipo (DOC_TYPE=GV)
 *   - Poliza Gasto de Viaje sin Anticipo (DOC_TYPE=GV)
 */
import { XMLBuilder } from "fast-xml-parser";
import AccountingExport from "../models/accountingExportModel.js";
import {
    SOCIEDAD_DEFAULT,
    GL_ACCOUNTS,
    DOC_TYPES,
    SHKZG,
    proveedorFromUserId,
    formatPstngDate,
} from "../config/accountingCatalogs.js";

const MXN = "MXN";

/**
 *
 */
class NotFoundError extends Error {
    /**
     *
     * @param message
     */
    constructor(message) {
        super(message);
        this.status = 404;
    }
}

/**
 *
 */
class ConflictError extends Error {
    /**
     *
     * @param message
     */
    constructor(message) {
        super(message);
        this.status = 409;
    }
}

/**
 * Redondea a 4 decimales (formato SAP AMT_DOCCUR N(23,4)).
 * @param {number} n
 * @returns {number}
 */
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

/**
 * Calcula tipo de cambio / moneda a partir del primer CFDI con moneda != MXN; si no hay, MXN con rate 1.
 * @param {Array<Object>} receipts
 * @returns {{ currency: string, exchRate: number }}
 */
const resolveCurrencyAndRate = (receipts) => {
    const withCfdi = receipts.find((r) => r.cfdiComprobante);
    if (!withCfdi) return { currency: MXN, exchRate: 1 };
    const c = withCfdi.cfdiComprobante;
    return {
        currency: c.moneda || MXN,
        exchRate: c.moneda && c.moneda !== MXN ? Number(c.tipoCambio) || 1 : 1,
    };
};

/**
 * Construye la poliza AV (anticipo) para un Request con imposedFee > 0.
 * @param {Object} request
 * @returns {Object} Poliza en formato plano (cabecera + detalles).
 */
const buildAnticipoPoliza = (request) => {
    const empCode = `Emp${String(request.userId).padStart(3, "0")}`;
    const vendorNo = proveedorFromUserId(request.userId);
    const amount = round4(request.imposedFee);
    const today = new Date();

    const header = {
        ID_VIAJE: String(request.requestId),
        DOC_TYPE: DOC_TYPES.ANTICIPO_VIAJE,
        HEADER_TXT: `Anticipo Viaje # ${request.requestId}`,
        COMP_CODE: SOCIEDAD_DEFAULT,
        PSTNG_DATE: formatPstngDate(today),
        CURRENCY: MXN,
        EXCH_RATE: 1,
    };

    const itemText = `Anticipo Viaje # ${request.requestId} #${empCode}`;
    const detalles = [
        {
            ITEMNO_ACC: 1,
            SHKZG: SHKZG.DEBE,
            GL_ACCOUNT: GL_ACCOUNTS.ANTICIPO,
            VENDOR_NO: vendorNo,
            ITEM_TEXT: itemText,
            AMT_DOCCUR: amount,
        },
        {
            ITEMNO_ACC: 2,
            SHKZG: SHKZG.HABER,
            GL_ACCOUNT: GL_ACCOUNTS.CUENTA_POR_PAGAR_EMPLEADO,
            VENDOR_NO: vendorNo,
            ITEM_TEXT: itemText,
            AMT_DOCCUR: amount,
        },
    ];

    return { header, detalles };
};

/**
 * Construye la poliza GV (comprobacion de gastos), con o sin anticipo.
 * Por cada Receipt aprobado emite 1 debe 1002 (subtotal) + 1 debe 1003 (iva),
 * y al final 1 haber por el total: 1000 (si hubo anticipo) o 1001 (si no hubo).
 *
 * @param {Object} request
 * @param {boolean} hasAnticipo
 * @returns {Object|null} Poliza o null si no hay receipts con CFDI.
 */
const buildComprobacionPoliza = (request, hasAnticipo) => {
    const receipts = (request.receipts || []).filter((r) => r.cfdiComprobante);
    if (receipts.length === 0) return null;

    const vendorNo = proveedorFromUserId(request.userId);
    const costCenter = request.user?.department?.costsCenter || "";
    const { currency, exchRate } = resolveCurrencyAndRate(receipts);

    const lastValidation = receipts
        .map((r) => r.validationDate)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    const pstngDate = formatPstngDate(lastValidation ? new Date(lastValidation) : new Date());

    const headerText = hasAnticipo
        ? `Comprobacion Viaje # ${request.requestId}`
        : `Gasto sin Anticipo # ${request.requestId}`;

    const header = {
        ID_VIAJE: String(request.requestId),
        DOC_TYPE: DOC_TYPES.GASTO_VIAJE,
        HEADER_TXT: headerText.slice(0, 25),
        COMP_CODE: SOCIEDAD_DEFAULT,
        PSTNG_DATE: pstngDate,
        CURRENCY: currency,
        EXCH_RATE: exchRate,
    };

    const detalles = [];
    let itemNo = 1;
    let totalAcum = 0;

    for (const r of receipts) {
        const c = r.cfdiComprobante;
        const subtotal = round4(c.subtotal);
        const iva = round4(c.iva);
        const total = round4(c.total);
        const text = (r.receiptType?.receiptTypeName
            ? `Comprobacion ${r.receiptType.receiptTypeName}`
            : `Comprobacion Receipt ${r.receiptId}`).slice(0, 50);

        detalles.push({
            ITEMNO_ACC: itemNo++,
            SHKZG: SHKZG.DEBE,
            GL_ACCOUNT: GL_ACCOUNTS.GASTO_DE_VIAJE,
            COSTCENTER: costCenter,
            ITEM_TEXT: text,
            AMT_DOCCUR: subtotal,
        });

        if (iva > 0) {
            detalles.push({
                ITEMNO_ACC: itemNo++,
                SHKZG: SHKZG.DEBE,
                GL_ACCOUNT: GL_ACCOUNTS.IVA_ACREDITABLE,
                ITEM_TEXT: text,
                AMT_DOCCUR: iva,
            });
        }

        totalAcum += total;
    }

    const haberGl = hasAnticipo
        ? GL_ACCOUNTS.ANTICIPO
        : GL_ACCOUNTS.CUENTA_POR_PAGAR_EMPLEADO;
    const haberText = (receipts[0]?.receiptType?.receiptTypeName
        ? `Comprobacion ${receipts[0].receiptType.receiptTypeName}`
        : `Comprobacion Viaje ${request.requestId}`).slice(0, 50);

    detalles.push({
        ITEMNO_ACC: itemNo++,
        SHKZG: SHKZG.HABER,
        GL_ACCOUNT: haberGl,
        VENDOR_NO: vendorNo,
        ITEM_TEXT: haberText,
        AMT_DOCCUR: round4(totalAcum),
    });

    return { header, detalles };
};

/**
 * Construye la(s) poliza(s) aplicable(s) para un Request dado.
 * @param {Object} request
 * @returns {Array<Object>}
 */
const buildPolizasFromRequest = (request) => {
    const polizas = [];
    const hasAnticipo = Number(request.imposedFee || 0) > 0;

    if (hasAnticipo) {
        polizas.push(buildAnticipoPoliza(request));
    }

    const comprobacion = buildComprobacionPoliza(request, hasAnticipo);
    if (comprobacion) polizas.push(comprobacion);

    return polizas;
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
                Detalles: { Detalle: p.detalles },
            })),
        },
    };
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlBuilder.build(payload);
};

const AccountingExportService = {
    /**
     * Obtiene y arma las polizas de UN Request finalizado.
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
        return buildPolizasFromRequest(request);
    },

    /**
     * Obtiene y arma las polizas de todos los Requests finalizados con validaciones en el rango [from, to].
     * @param {Date} from
     * @param {Date} to
     * @returns {Promise<Array<Object>>}
     */
    async getPolizasInRange(from, to) {
        const requests = await AccountingExport.getFinalizedRequestsInRange(from, to);
        return requests.flatMap(buildPolizasFromRequest);
    },

    polizasToXml,
    NotFoundError,
    ConflictError,
};

export default AccountingExportService;
