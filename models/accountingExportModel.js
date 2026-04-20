/**
 * @module accountingExportModel
 * @description Capa de acceso a datos para la exportacion contable (polizas AV/GV hacia el ERP).
 * Lee Request + User + Department + Receipt + CfdiComprobante en una sola consulta Prisma
 * con la forma que el servicio de exportacion necesita.
 */
import prisma from "../database/config/prisma.js";

const AccountingExport = {
    /**
     * Obtiene un Request con todo lo que una poliza contable requiere.
     * @param {number} requestId
     * @returns {Promise<Object|null>} Request con user.department, receipts (solo validacion=Aprobado) y sus cfdiComprobante.
     */
    async getRequestForExport(requestId) {
        const request = await prisma.request.findUnique({
            where: { requestId: Number(requestId) },
            include: {
                user: { include: { department: true } },
                requestStatus: true,
                receipts: {
                    where: { validation: "Aprobado" },
                    include: { cfdiComprobante: true, receiptType: true },
                    orderBy: { receiptId: "asc" },
                },
            },
        });
        return request;
    },

    /**
     * Obtiene todos los Requests Finalizados cuyo ultimo validationDate cae dentro del rango.
     * Se usa para la exportacion batch (ERP jala polizas por rango).
     * @param {Date} from
     * @param {Date} to
     * @returns {Promise<Array<Object>>}
     */
    async getFinalizedRequestsInRange(from, to) {
        return prisma.request.findMany({
            where: {
                requestStatusId: 8, // Finalizado
                receipts: {
                    some: {
                        validation: "Aprobado",
                        validationDate: { gte: from, lte: to },
                    },
                },
            },
            include: {
                user: { include: { department: true } },
                requestStatus: true,
                receipts: {
                    where: { validation: "Aprobado" },
                    include: { cfdiComprobante: true, receiptType: true },
                    orderBy: { receiptId: "asc" },
                },
            },
            orderBy: { requestId: "asc" },
        });
    },
};

export default AccountingExport;
