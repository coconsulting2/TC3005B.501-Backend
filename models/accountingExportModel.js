/**
 * @module accountingExportModel
 * @description Capa de acceso a datos para la exportacion contable (polizas AV/GV hacia el ERP).
 * Lee Request + User + Department + Receipt + CfdiComprobante en una sola consulta Prisma
 * con la forma que el servicio de exportacion necesita.
 */
import prisma from "../database/config/prisma.js";

/** Campos de inclusion reutilizados en todas las consultas de exportacion. */
const EXPORT_INCLUDE = {
    user: { include: { department: true, empleado: true } },
    organization: {
        include: {
            chartOfAccounts: { where: { active: true } },
            accountingSocieties: true,
        },
    },
    requestStatus: true,
    receipts: {
        where: { validation: "Aprobado" },
        include: { cfdiComprobante: true, receiptType: true },
        orderBy: { receiptId: "asc" },
    },
};

const AccountingExport = {
    /**
     * Obtiene un Request con todo lo que una poliza contable requiere.
     * @param {number} requestId
     * @returns {Promise<Object|null>}
     */
    async getRequestForExport(requestId) {
        return prisma.request.findUnique({
            where: { requestId: Number(requestId) },
            include: EXPORT_INCLUDE,
        });
    },

    /**
     * Obtiene todos los Requests Finalizados cuyo ultimo validationDate cae dentro del rango.
     * @param {Date} from
     * @param {Date} to
     * @param {boolean} [force=false] - Si true, incluye registros ya exportados.
     * @returns {Promise<Array<Object>>}
     */
    async getFinalizedRequestsInRange(from, to, force = false) {
        const where = {
            requestStatusId: 8, // Finalizado
            receipts: {
                some: {
                    validation: "Aprobado",
                    validationDate: { gte: from, lte: to },
                },
            },
        };

        if (!force) {
            where.isExported = false;
        }

        return prisma.request.findMany({
            where,
            include: EXPORT_INCLUDE,
            orderBy: { requestId: "asc" },
        });
    },

    /**
     * Marca un conjunto de Requests como exportados al ERP.
     * @param {number[]} requestIds
     * @returns {Promise<void>}
     */
    async markRequestsAsExported(requestIds) {
        if (!requestIds || requestIds.length === 0) return;
        await prisma.request.updateMany({
            where: { requestId: { in: requestIds } },
            data: {
                isExported: true,
                exportedAt: new Date(),
            },
        });
    },
};

export default AccountingExport;
