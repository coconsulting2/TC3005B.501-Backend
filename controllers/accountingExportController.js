/**
 * @module accountingExportController
 * @description HTTP handlers para la exportacion contable (M1-010).
 * Expone dos endpoints restringidos al rol "Cuentas por pagar":
 *   GET /accounting-export/:request_id           - polizas de un Request finalizado
 *   GET /accounting-export?from=&to=             - polizas de Requests finalizados en un rango
 * Formato de respuesta: JSON por default, XML si ?format=xml o Accept: application/xml.
 */
import AccountingExportService from "../services/accountingExportService.js";

/**
 * Decide formato de salida segun query (?format=) o header Accept.
 * @param {import('express').Request} req
 * @returns {'xml'|'json'}
 */
const resolveFormat = (req) => {
    const q = String(req.query.format || "").toLowerCase();
    if (q === "xml" || q === "json") return q;
    const accept = String(req.headers.accept || "").toLowerCase();
    if (accept.includes("application/xml") || accept.includes("text/xml")) return "xml";
    return "json";
};

/**
 * Enviar polizas en el formato solicitado.
 * @param {import('express').Response} res
 * @param {Array<Object>} polizas
 * @param {'xml'|'json'} format
 */
const sendPolizas = (res, polizas, format) => {
    if (format === "xml") {
        res.type("application/xml");
        return res.status(200).send(AccountingExportService.polizasToXml(polizas));
    }
    return res.status(200).json({ polizas });
};

/**
 * Exporta polizas contables para un Request finalizado.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const exportByRequest = async (req, res) => {
    const requestId = Number(req.params.request_id);
    const format = resolveFormat(req);

    try {
        const polizas = await AccountingExportService.getPolizasForRequest(requestId);
        return sendPolizas(res, polizas, format);
    } catch (error) {
        if (error instanceof AccountingExportService.NotFoundError) {
            return res.status(404).json({ error: error.message });
        }
        if (error instanceof AccountingExportService.ConflictError) {
            return res.status(409).json({ error: error.message });
        }
        console.error("Error in exportByRequest controller:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Exporta polizas contables de todos los Requests finalizados en un rango [from, to].
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const exportByRange = async (req, res) => {
    const { from, to } = req.query;
    const format = resolveFormat(req);

    const fromDate = from ? new Date(String(from)) : null;
    const toDate = to ? new Date(String(to)) : null;

    if (!fromDate || Number.isNaN(fromDate.getTime()) || !toDate || Number.isNaN(toDate.getTime())) {
        return res.status(400).json({ error: "Query params 'from' and 'to' (YYYY-MM-DD) are required" });
    }
    if (fromDate > toDate) {
        return res.status(400).json({ error: "'from' must be on or before 'to'" });
    }

    // Inclusivo hasta el final del dia para 'to'.
    toDate.setHours(23, 59, 59, 999);

    try {
        const polizas = await AccountingExportService.getPolizasInRange(fromDate, toDate);
        return sendPolizas(res, polizas, format);
    } catch (error) {
        console.error("Error in exportByRange controller:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export default {
    exportByRequest,
    exportByRange,
};
