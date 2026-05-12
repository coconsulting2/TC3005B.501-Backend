/**
 * @module polizasController
 * @description Listado, generación y export por id de pólizas persistidas (spec CocoAPI §12).
 */
import AccountingPolizaModel from "../models/accountingPolizaModel.js";
import AccountingExportService from "../services/accountingExportService.js";

/**
 * @param {import("express").Request} req
 * @returns {"xml"|"json"}
 */
const resolveFormat = (req) => {
    const q = String(req.query.format || "").toLowerCase();
    if (q === "xml" || q === "json") return q;
    const accept = String(req.headers.accept || "").toLowerCase();
    if (accept.includes("application/xml") || accept.includes("text/xml")) return "xml";
    return "json";
};

/**
 * GET /api/accounts-payable/polizas
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const listPolizas = async (req, res) => {
    try {
        const orgId = req.user.organization_id;
        const requestId = req.query.request_id;
        const from = req.query.from ? new Date(String(req.query.from)) : null;
        const to = req.query.to ? new Date(String(req.query.to)) : null;
        if (to && !Number.isNaN(to.getTime())) to.setHours(23, 59, 59, 999);
        const limit =
            req.query.limit !== undefined && req.query.limit !== null ? Number(req.query.limit) : 50;
        const rows = await AccountingPolizaModel.listForOrganization({
            organizationId: orgId,
            requestId:
                requestId !== undefined && requestId !== null && requestId !== ""
                    ? Number(requestId)
                    : undefined,
            from: from && !Number.isNaN(from.getTime()) ? from : undefined,
            to: to && !Number.isNaN(to.getTime()) ? to : undefined,
            limit,
        });
        return res.status(200).json({ polizas: rows });
    } catch (err) {
        console.error("listPolizas:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * POST /api/accounts-payable/polizas/:request_id/generar
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const generarPolizas = async (req, res) => {
    try {
        const polizas = await AccountingExportService.generatePolizasForRequest(Number(req.params.request_id));
        return res.status(201).json({ polizas });
    } catch (error) {
        if (error instanceof AccountingExportService.ValidationError) {
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof AccountingExportService.NotFoundError) {
            return res.status(404).json({ error: error.message });
        }
        if (error instanceof AccountingExportService.ConflictError) {
            return res.status(409).json({ error: error.message });
        }
        console.error("generarPolizas:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * GET /api/accounts-payable/polizas/:poliza_id/export
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
const exportPolizaById = async (req, res) => {
    try {
        const row = await AccountingPolizaModel.findPayloadById(req.user.organization_id, req.params.poliza_id);
        if (!row?.payload) {
            return res.status(404).json({ error: "Poliza not found" });
        }
        const format = resolveFormat(req);
        const poliza = row.payload;
        if (format === "xml") {
            res.type("application/xml");
            return res.status(200).send(AccountingExportService.polizasToXml([poliza]));
        }
        const compatible = {
            ...poliza,
            detalles: poliza.detalle || poliza.detalles || [],
        };
        return res.status(200).json({
            id: row.id,
            requestId: row.requestId,
            docType: row.docType,
            createdAt: row.createdAt,
            poliza: compatible,
        });
    } catch (err) {
        console.error("exportPolizaById:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export default {
    listPolizas,
    generarPolizas,
    exportPolizaById,
};
