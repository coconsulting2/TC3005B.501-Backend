/**
 * @module inboxController
 * @description GET /api/solicitudes/inbox — bandeja de aprobaciones backend (M2-007 dependency).
 *   Filtra por status según rol del aprobador (N1=2, N2=3, otros=todos los visibles)
 *   y agrega pendingExceptionCount (M2-006).
 */
import prisma from "../database/config/prisma.js";

const NACIONAL_HOME_COUNTRY_ID = 1; // México

/**
 *
 * @param role
 */
function statusForRole(role) {
  if (role === "N1") return [2];
  if (role === "N2") return [3];
  return [2, 3];
}

/**
 *
 * @param routes
 */
function tripType(routes) {
  const isInternational = (routes || []).some((rr) => {
    const r = rr.route;
    if (!r || r.idDestinationCountry == null) return false;
    return Number(r.idDestinationCountry) !== NACIONAL_HOME_COUNTRY_ID;
  });
  return isInternational ? "internacional" : "nacional";
}

/**
 * GET /api/solicitudes/inbox?status=&dateFrom=&dateTo=&min=&max=&type=
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export const getInbox = async (req, res) => {
  try {
    const role = req.user.role || null;
    const requestedStatuses = req.query.status
      ? String(req.query.status).split(",").map((s) => Number(s.trim())).filter(Boolean)
      : statusForRole(role);

    const where = {
      requestStatusId: { in: requestedStatuses },
      active: true,
    };

    if (req.query.dateFrom || req.query.dateTo) {
      where.creationDate = {};
      if (req.query.dateFrom) where.creationDate.gte = new Date(req.query.dateFrom);
      if (req.query.dateTo)   where.creationDate.lte = new Date(req.query.dateTo);
    }
    if (req.query.min || req.query.max) {
      where.requestedFee = {};
      if (req.query.min) where.requestedFee.gte = Number(req.query.min);
      if (req.query.max) where.requestedFee.lte = Number(req.query.max);
    }

    const requests = await prisma.request.findMany({
      where,
      select: {
        requestId: true, requestStatusId: true, creationDate: true, lastModDate: true,
        requestedFee: true, notes: true, tripName: true, tripEndDate: true,
        user: { select: { userId: true, userName: true, email: true, department: { select: { departmentName: true, costsCenter: true } } } },
        routeRequests: { select: { route: { select: { idDestinationCountry: true, destinationCountry: { select: { countryName: true } } } } } },
        policyExceptions: { where: { status: "PENDING" }, select: { exceptionId: true } },
      },
      orderBy: [{ creationDate: "desc" }],
    });

    let payload = requests.map((r) => ({
      requestId: r.requestId,
      requestStatusId: r.requestStatusId,
      creationDate: r.creationDate,
      lastModDate: r.lastModDate,
      requestedFee: r.requestedFee,
      notes: r.notes,
      tripName: r.tripName,
      tripEndDate: r.tripEndDate,
      requesterName: r.user?.userName || null,
      requesterEmail: r.user?.email || null,
      departmentName: r.user?.department?.departmentName || null,
      costsCenter: r.user?.department?.costsCenter || null,
      destinationCountry: r.routeRequests[0]?.route?.destinationCountry?.countryName || null,
      type: tripType(r.routeRequests),
      pendingExceptionCount: r.policyExceptions.length,
    }));

    if (req.query.type === "nacional" || req.query.type === "internacional") {
      payload = payload.filter((p) => p.type === req.query.type);
    }

    return res.status(200).json({ requests: payload });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error("inbox.get:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
};
