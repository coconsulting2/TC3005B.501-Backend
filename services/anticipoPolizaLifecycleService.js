/**
 * @module anticipoPolizaLifecycleService
 * @description Persiste snapshots de la póliza AV en hitos del flujo: aprobación de la solicitud
 * (monto requested_fee) y cierre por comprobación de gastos (monto imposed_fee).
 */
import { Prisma } from "@prisma/client";
import prisma from "../database/config/prisma.js";
import { buildAnticipoPolizaForAdvance } from "./accountingExportService.js";

export const ON_TRAVEL_APPROVED = "ON_TRAVEL_APPROVED";
export const ON_EXPENSES_VERIFIED = "ON_EXPENSES_VERIFIED";

/**
 * @param {number} requestId
 * @param {string} phase ON_TRAVEL_APPROVED | ON_EXPENSES_VERIFIED
 * @param {number} advanceAmount
 * @returns {Promise<void>}
 */
async function persistSnapshot(requestId, phase, advanceAmount) {
    const row = await prisma.request.findUnique({
        where: { requestId: Number(requestId) },
        include: {
            user: { include: { empleado: true, department: true } },
            organization: {
                include: {
                    chartOfAccounts: { where: { active: true } },
                    accountingSocieties: true,
                },
            },
        },
    });
    if (!row?.userId) return;

    const poliza = buildAnticipoPolizaForAdvance(
        {
            requestId: row.requestId,
            userId: row.userId,
            organizationId: row.organizationId,
            organization: row.organization,
            user: row.user,
        },
        advanceAmount,
    );
    if (!poliza) return;

    try {
        await prisma.anticipoPolizaSnapshot.create({
            data: {
                organizationId: row.organizationId,
                requestId: row.requestId,
                phase,
                payload: poliza,
            },
        });
    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            return;
        }
        throw err;
    }
}

/**
 * Tras aprobación N1/N2: la solicitud pasa a cotización (status 4). Usa requested_fee.
 * @param {number} requestId
 * @returns {Promise<void>}
 */
export async function onTravelRequestFullyApproved(requestId) {
    const row = await prisma.request.findUnique({
        where: { requestId: Number(requestId) },
        select: { requestedFee: true },
    });
    const amt = row?.requestedFee;
    if (amt === null || amt === undefined || Number(amt) <= 0) return;
    await persistSnapshot(requestId, ON_TRAVEL_APPROVED, Number(amt));
}

/**
 * Tras validar todos los recibos y marcar el viaje Finalizado. Usa imposed_fee (anticipo real CPP).
 * @param {number} requestId
 * @returns {Promise<void>}
 */
export async function onExpensesVerified(requestId) {
    const row = await prisma.request.findUnique({
        where: { requestId: Number(requestId) },
        select: { imposedFee: true },
    });
    const amt = row?.imposedFee;
    if (amt === null || amt === undefined || Number(amt) <= 0) return;
    await persistSnapshot(requestId, ON_EXPENSES_VERIFIED, Number(amt));
}

export default {
    onTravelRequestFullyApproved,
    onExpensesVerified,
    ON_TRAVEL_APPROVED,
    ON_EXPENSES_VERIFIED,
};
