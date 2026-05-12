/**
 * @module accountingPolizaModel
 * @description Persistencia y consulta de pólizas contables (tabla accounting_poliza).
 */
import prisma from "../database/config/prisma.js";

const AccountingPolizaModel = {
    /**
     * @param {object} params
     * @param {bigint|number|string} params.organizationId
     * @param {number} params.requestId
     * @param {import('../types/poliza.js').Poliza[]} params.polizas
     * @param {boolean} params.requestMarkedExported
     * @returns {Promise<void>}
     */
    async insertPolizasForRequest({ organizationId, requestId, polizas, requestMarkedExported }) {
        if (!polizas || polizas.length === 0) return;
        const org = BigInt(organizationId);
        await prisma.accountingPoliza.createMany({
            data: polizas.map((p, idx) => ({
                organizationId: org,
                requestId: Number(requestId),
                polizaIndex: idx,
                docType: String(p.header?.DOC_TYPE || "").slice(0, 2),
                payload: p,
                requestMarkedExported: Boolean(requestMarkedExported),
            })),
        });
    },

    /**
     * @param {object} params
     * @param {bigint|number|string} params.organizationId
     * @param {number} [params.requestId]
     * @param {Date} [params.from]
     * @param {Date} [params.to]
     * @param {number} [params.limit]
     * @returns {Promise<object[]>}
     */
    async listForOrganization({ organizationId, requestId, from, to, limit = 50 }) {
        const org = BigInt(organizationId);
        const where = { organizationId: org };
        if (requestId !== undefined && requestId !== null && requestId !== "") {
            where.requestId = Number(requestId);
        }
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = from;
            if (to) where.createdAt.lte = to;
        }
        return prisma.accountingPoliza.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: Math.min(Math.max(Number(limit) || 50, 1), 200),
            select: {
                id: true,
                requestId: true,
                polizaIndex: true,
                docType: true,
                requestMarkedExported: true,
                createdAt: true,
            },
        });
    },

    /**
     * @param {bigint|number|string} organizationId
     * @param {string} id cuid
     * @returns {Promise<object|null>}
     */
    async findPayloadById(organizationId, id) {
        const org = BigInt(organizationId);
        return prisma.accountingPoliza.findFirst({
            where: { id: String(id), organizationId: org },
            select: { id: true, payload: true, requestId: true, docType: true, createdAt: true },
        });
    },
};

export default AccountingPolizaModel;
