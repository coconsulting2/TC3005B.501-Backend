/**
 * @module gastoTramoModel
 * @description Data access layer for gasto_tramo: links receipts (comprobantes) to
 * specific route segments (tramos) within a travel request (viaje).
 */
import prisma from "../database/config/prisma.js";

/**
 * @param {unknown} value
 * @returns {number}
 */
function toAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {*} db - Prisma client or transaction
 * @param {number} requestId
 * @returns {Promise<number[]>}
 */
async function getRouteIdsForRequest(db, requestId) {
  const rows = await db.routeRequest.findMany({
    where: { requestId: Number(requestId) },
    include: { route: { select: { routeId: true, routerIndex: true } } },
    orderBy: { route: { routerIndex: "asc" } },
  });
  return rows.map((rr) => rr.route?.routeId).filter((id) => id != null);
}

/**
 * Vincula un comprobante al tramo indicado o al único tramo del viaje.
 * @param {*} db
 * @param {number} requestId
 * @param {number} receiptId
 * @param {number|null|undefined} preferredRouteId
 */
async function autoLinkReceiptToTramo(db, requestId, receiptId, preferredRouteId) {
  const rid = Number(requestId);
  const receiptIdNum = Number(receiptId);

  const existing = await db.gastoTramo.findUnique({
    where: { receiptId: receiptIdNum },
  });
  if (existing) return existing;

  const routeIds = await getRouteIdsForRequest(db, rid);
  if (routeIds.length === 0) return null;

  let routeId = preferredRouteId != null ? Number(preferredRouteId) : null;
  if (routeId != null && !routeIds.includes(routeId)) {
    routeId = null;
  }
  if (routeId == null && routeIds.length === 1) {
    routeId = routeIds[0];
  }
  if (routeId == null) return null;

  const routeRequest = await db.routeRequest.findFirst({
    where: { requestId: rid, routeId },
  });
  if (!routeRequest) return null;

  return db.gastoTramo.create({
    data: {
      requestId: rid,
      routeId,
      receiptId: receiptIdNum,
    },
  });
}

/**
 * Para viajes de un solo tramo, vincula comprobantes huérfanos existentes.
 * @param {number} requestId
 */
async function syncOrphanReceiptsForSingleTramoRequest(requestId) {
  const rid = Number(requestId);
  const routeIds = await getRouteIdsForRequest(prisma, rid);
  if (routeIds.length !== 1) return;

  const linked = await prisma.gastoTramo.findMany({
    where: { requestId: rid },
    select: { receiptId: true },
  });
  const linkedIds = new Set(linked.map((g) => g.receiptId));

  const orphans = await prisma.receipt.findMany({
    where: {
      requestId: rid,
      ...(linkedIds.size > 0 ? { receiptId: { notIn: [...linkedIds] } } : {}),
    },
    select: { receiptId: true },
  });

  if (orphans.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const row of orphans) {
      await autoLinkReceiptToTramo(tx, rid, row.receiptId, routeIds[0]);
    }
  });
}

const GastoTramo = {
  /**
   * Associates a receipt (comprobante) with a specific tramo of a viaje.
   * Validates that the tramo belongs to the viaje and that the receipt belongs
   * to the same viaje before creating the link.
   *
   * @param {number} requestId - The viaje (Request) ID
   * @param {number} routeId   - The tramo (Route) ID
   * @param {number} receiptId - The comprobante (Receipt) ID
   * @returns {Promise<{gastoTramoId: number, message: string}>}
   * @throws {Error} When request, route, or receipt not found / ownership mismatch
   */
  async createGastoTramo(requestId, routeId, receiptId) {
    return await prisma.$transaction(async (tx) => {
      // Verify request exists
      const request = await tx.request.findUnique({
        where: { requestId: Number(requestId) },
        select: { requestId: true },
      });
      if (!request) {
        throw new Error("VIAJE_NOT_FOUND");
      }

      // Verify tramo belongs to the viaje via RouteRequest
      const routeRequest = await tx.routeRequest.findFirst({
        where: {
          requestId: Number(requestId),
          routeId: Number(routeId),
        },
      });
      if (!routeRequest) {
        throw new Error("TRAMO_NOT_IN_VIAJE");
      }

      // Verify receipt exists and belongs to the viaje
      const receipt = await tx.receipt.findUnique({
        where: { receiptId: Number(receiptId) },
        select: { receiptId: true, requestId: true },
      });
      if (!receipt) {
        throw new Error("COMPROBANTE_NOT_FOUND");
      }
      if (receipt.requestId !== Number(requestId)) {
        throw new Error("COMPROBANTE_NOT_IN_VIAJE");
      }

      // Check receipt not already linked to another tramo
      const existing = await tx.gastoTramo.findUnique({
        where: { receiptId: Number(receiptId) },
      });
      if (existing) {
        throw new Error("COMPROBANTE_ALREADY_LINKED");
      }

      const gastoTramo = await tx.gastoTramo.create({
        data: {
          requestId: Number(requestId),
          routeId: Number(routeId),
          receiptId: Number(receiptId),
        },
      });

      return {
        gastoTramoId: gastoTramo.gastoTramoId,
        message: "Comprobante asociado al tramo exitosamente",
      };
    });
  },

  /**
   * Returns a consolidated summary of all tramos for a viaje, each with its
   * associated comprobantes and a subtotal. Includes a grand total.
   *
   * @param {number} requestId - The viaje (Request) ID
   * @returns {Promise<Object>} Summary with per-tramo breakdown and total_general
   * @throws {Error} When request not found
   */
  async getResumenTramos(requestId) {
    const request = await prisma.request.findUnique({
      where: { requestId: Number(requestId) },
      select: { requestId: true },
    });
    if (!request) {
      throw new Error("VIAJE_NOT_FOUND");
    }

    await syncOrphanReceiptsForSingleTramoRequest(requestId);

    const routeRequests = await prisma.routeRequest.findMany({
      where: { requestId: Number(requestId) },
      include: {
        route: {
          include: {
            originCountry: true,
            originCity: true,
            destinationCountry: true,
            destinationCity: true,
            gastoTramos: {
              where: { requestId: Number(requestId) },
              include: {
                receipt: {
                  include: { receiptType: true },
                },
              },
            },
          },
        },
      },
      orderBy: { route: { routerIndex: "asc" } },
    });

    let totalGeneral = 0;

    const tramos = routeRequests.map((rr) => {
      const route = rr.route;
      const comprobantes = (route?.gastoTramos ?? []).map((gt) => ({
        gasto_tramo_id: gt.gastoTramoId,
        receipt_id: gt.receiptId,
        receipt_type: gt.receipt?.receiptType?.receiptTypeName ?? null,
        amount: toAmount(gt.receipt?.amount),
        validation: gt.receipt?.validation ?? null,
        submission_date: gt.receipt?.submissionDate ?? null,
      }));

      const totalTramo = comprobantes.reduce((sum, c) => sum + c.amount, 0);
      totalGeneral += totalTramo;

      return {
        tramo_id: route?.routeId ?? null,
        router_index: route?.routerIndex ?? null,
        origin_country: route?.originCountry?.countryName ?? null,
        origin_city: route?.originCity?.cityName ?? null,
        destination_country: route?.destinationCountry?.countryName ?? null,
        destination_city: route?.destinationCity?.cityName ?? null,
        beginning_date: route?.beginningDate ?? null,
        ending_date: route?.endingDate ?? null,
        comprobantes,
        total_tramo: totalTramo,
      };
    });

    const linkedReceiptIds = new Set(
      tramos.flatMap((t) => t.comprobantes.map((c) => c.receipt_id)),
    );

    const orphanReceipts = await prisma.receipt.findMany({
      where: {
        requestId: Number(requestId),
        ...(linkedReceiptIds.size > 0
          ? { receiptId: { notIn: [...linkedReceiptIds] } }
          : {}),
      },
      include: { receiptType: true },
      orderBy: { receiptId: "asc" },
    });

    if (orphanReceipts.length > 0 && tramos.length > 1) {
      const comprobantes = orphanReceipts.map((r) => ({
        gasto_tramo_id: null,
        receipt_id: r.receiptId,
        receipt_type: r.receiptType?.receiptTypeName ?? null,
        amount: toAmount(r.amount),
        validation: r.validation ?? null,
        submission_date: r.submissionDate ?? null,
      }));
      const totalTramo = comprobantes.reduce((sum, c) => sum + c.amount, 0);
      totalGeneral += totalTramo;
      tramos.push({
        tramo_id: null,
        router_index: null,
        origin_country: null,
        origin_city: "Sin tramo",
        destination_country: null,
        destination_city: "asignado",
        beginning_date: null,
        ending_date: null,
        comprobantes,
        total_tramo: totalTramo,
        unassigned: true,
      });
    }

    return {
      viaje_id: Number(requestId),
      tramos,
      total_general: totalGeneral,
    };
  },

  autoLinkReceiptToTramo,
  syncOrphanReceiptsForSingleTramoRequest,
};

export { autoLinkReceiptToTramo, syncOrphanReceiptsForSingleTramoRequest };
export default GastoTramo;
