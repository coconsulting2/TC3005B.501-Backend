/**
 * @module userModel
 * @description Data access layer for user-related queries using Prisma.
 */
import prisma from "../database/config/prisma.js";

const User = {
  /**
   * Get all user data by ID.
   * @param {string|number} userId - User ID.
   * @returns {Promise<Object|undefined>} User row or undefined.
   */
  async getUserData(userId) {
    const user = await prisma.user.findUnique({
      where: { userId: Number(userId) },
      include: {
        role: true,
        department: true,
      },
    });

    if (!user) return undefined;

    return {
      user_id: user.userId,
      user_name: user.userName,
      email: user.email,
      phone_number: user.phoneNumber,
      workstation: user.workstation,
      no_empleado: user.noEmpleado,
      department_name: user.department?.departmentName,
      costs_center: user.department?.costsCenter,
      creation_date: user.creationDate,
      role_name: user.role?.roleName,
    };
  },

  /**
   * Get a travel request by ID with route and location details.
   * Returns one row per route (same shape as the old SQL join).
   * @param {string|number} requestId - Request ID.
   * @returns {Promise<Array>} Request rows (ordered by router_index).
   */
  async getTravelRequestById(requestId) {
    const request = await prisma.request.findUnique({
      where: { requestId: Number(requestId) },
      include: {
        user: true,
        requestStatus: true,
        routeRequests: {
          include: {
            route: {
              include: {
                originCountry: true,
                originCity: true,
                destinationCountry: true,
                destinationCity: true,
              },
            },
          },
          orderBy: { route: { routerIndex: "asc" } },
        },
      },
    });

    if (!request) return [];

    // Flatten to one row per route to match old SQL output
    if (request.routeRequests.length === 0) {
      return [{
        request_id: request.requestId,
        request_status: request.requestStatus.status,
        notes: request.notes,
        trip_name: request.tripName,
        requested_fee: request.requestedFee,
        imposed_fee: request.imposedFee,
        request_days: request.requestDays,
        creation_date: request.creationDate,
        user_name: request.user?.userName,
        user_email: request.user?.email,
        user_phone_number: request.user?.phoneNumber,
        router_index: null,
        origin_country: null,
        origin_city: null,
        destination_country: null,
        destination_city: null,
        beginning_date: null,
        beginning_time: null,
        ending_date: null,
        ending_time: null,
        hotel_needed: null,
        plane_needed: null,
      }];
    }

    return request.routeRequests.map((rr) => {
      const route = rr.route;
      return {
        request_id: request.requestId,
        request_status: request.requestStatus.status,
        notes: request.notes,
        trip_name: request.tripName,
        requested_fee: request.requestedFee,
        imposed_fee: request.imposedFee,
        request_days: request.requestDays,
        creation_date: request.creationDate,
        user_name: request.user?.userName,
        user_email: request.user?.email,
        user_phone_number: request.user?.phoneNumber,
        router_index: route?.routerIndex,
        origin_country: route?.originCountry?.countryName,
        origin_city: route?.originCity?.cityName,
        destination_country: route?.destinationCountry?.countryName,
        destination_city: route?.destinationCity?.cityName,
        beginning_date: route?.beginningDate,
        beginning_time: route?.beginningTime,
        ending_date: route?.endingDate,
        ending_time: route?.endingTime,
        hotel_needed: route?.hotelNeeded,
        plane_needed: route?.planeNeeded,
      };
    });
  },

  /**
   * Get travel requests by department and status, optionally limited.
   * Returns one row per request (picks the first route's destination country).
   *
   * @deprecated Usar `getTravelRequestsForApprover` que filtra por aprobador
   * esperado en `workflow_pre_snapshot` (no por departamento del solicitante).
   * Se mantiene por compatibilidad con consumidores legados.
   *
   * @param {string|number} deptId - Department ID.
   * @param {string|number} statusId - Request status ID.
   * @param {number} [n] - Optional limit.
   * @returns {Promise<Array>} Request rows.
   */
  async getTravelRequestsByDeptStatus(deptId, statusId, n) {
    const requests = await prisma.request.findMany({
      where: {
        user: { departmentId: Number(deptId) },
        requestStatusId: Number(statusId),
      },
      include: {
        user: true,
        requestStatus: true,
        routeRequests: {
          include: {
            route: {
              include: { destinationCountry: true },
            },
          },
          orderBy: { route: { routerIndex: "asc" } },
          take: 1,
        },
      },
      orderBy: { creationDate: "desc" },
      ...(n ? { take: Number(n) } : {}),
    });

    return requests.map((r) => {
      const firstRoute = r.routeRequests[0]?.route;
      return {
        request_id: r.requestId,
        user_id: r.userId,
        trip_name: r.tripName ?? null,
        requester_name: r.user?.userName ?? null,
        destination_country: firstRoute?.destinationCountry?.countryName || null,
        beginning_date: firstRoute?.beginningDate || null,
        ending_date: firstRoute?.endingDate || null,
        request_status: r.requestStatus.status,
      };
    });
  },

  /**
   * Lista de subordinados directos (depth=1) de un manager.
   * @param {number} managerUserId
   * @returns {Promise<number[]>}
   */
  async _getDirectSubordinates(managerUserId) {
    const rows = await prisma.user.findMany({
      where: { managerUserId: Number(managerUserId), active: true },
      select: { userId: true },
    });
    return rows.map((r) => Number(r.userId));
  },

  /**
   * Subordinados a profundidad exacta `depth` siguiendo `User.managerUserId`.
   * depth=1 → reportes directos; depth=2 → reportes de reportes; etc.
   *
   * @param {number} rootUserId
   * @param {number} depth
   * @returns {Promise<number[]>}
   */
  async _getSubordinatesAtDepth(rootUserId, depth) {
    if (!Number.isFinite(depth) || depth <= 0) return [];
    let frontier = [Number(rootUserId)];
    const visited = new Set(frontier);
    for (let i = 0; i < depth; i += 1) {
      const next = [];
      for (const u of frontier) {
        const direct = await User._getDirectSubordinates(u);
        for (const s of direct) {
          if (visited.has(s)) continue;
          visited.add(s);
          next.push(s);
        }
      }
      frontier = next;
      if (frontier.length === 0) return [];
    }
    return frontier;
  },

  /**
   * Bandeja de aprobador basada en el snapshot del workflow (no en departamento).
   *
   * Reglas:
   *  - statusId=2 → solicitudes con `workflow_pre_snapshot.n1UserId === actorUserId`.
   *  - statusId=3 → solicitudes con `workflow_pre_snapshot.n2UserId === actorUserId`.
   *  - Fallback opcional por jerarquía cuando WORKFLOW_APPROVAL_MODE=hierarchy:
   *    incluye solicitudes sin snapshot cuyo solicitante esté a la profundidad
   *    correcta dentro de la cadena `managerUserId` del actor.
   *
   * El motor de reglas (`services/workflowRulesEngine.js`) sigue siendo la
   * única autoridad para construir el snapshot; aquí sólo se lee.
   *
   * @param {number} actorUserId - userId que consulta la bandeja.
   * @param {number} statusId - 2 (Primera Revisión) o 3 (Segunda Revisión).
   * @param {{ organizationId?: bigint|number|string|null, n?: number }} [opts]
   * @returns {Promise<Array>}
   */
  async getTravelRequestsForApprover(actorUserId, statusId, opts = {}) {
    const actor = Number(actorUserId);
    const status = Number(statusId);

    if (!Number.isFinite(actor) || actor < 1) return [];
    if (status !== 2 && status !== 3) return [];

    const tierField = status === 2 ? "n1UserId" : "n2UserId";
    const tierDepth = status === 2 ? 1 : 2;

    const hierarchyMode =
      String(process.env.WORKFLOW_APPROVAL_MODE || "").toLowerCase() === "hierarchy";

    const orClauses = [
      {
        workflowPreSnapshot: {
          path: [tierField],
          equals: actor,
        },
      },
    ];

    if (hierarchyMode) {
      const subs = await User._getSubordinatesAtDepth(actor, tierDepth);
      if (subs.length > 0) {
        orClauses.push({
          AND: [
            { workflowPreSnapshot: { equals: null } },
            { userId: { in: subs } },
          ],
        });
      }
    }

    const where = {
      requestStatusId: status,
      OR: orClauses,
    };

    if (opts.organizationId != null && String(opts.organizationId).trim() !== "") {
      where.organizationId = BigInt(String(opts.organizationId).trim());
    }

    const requests = await prisma.request.findMany({
      where,
      include: {
        user: true,
        requestStatus: true,
        routeRequests: {
          include: {
            route: {
              include: { destinationCountry: true },
            },
          },
          orderBy: { route: { routerIndex: "asc" } },
          take: 1,
        },
      },
      orderBy: { creationDate: "desc" },
      ...(opts.n ? { take: Number(opts.n) } : {}),
    });

    return requests.map((r) => {
      const firstRoute = r.routeRequests[0]?.route;
      return {
        request_id: r.requestId,
        user_id: r.userId,
        trip_name: r.tripName ?? null,
        requester_name: r.user?.userName ?? null,
        destination_country: firstRoute?.destinationCountry?.countryName || null,
        beginning_date: firstRoute?.beginningDate || null,
        ending_date: firstRoute?.endingDate || null,
        request_status: r.requestStatus.status,
      };
    });
  },

  /**
   * Get user by username (for auth). userName es único por organización;
   * si hay varias coincidencias y no se pasa organizationId, se lanza error explícito.
   * @param {string} username - Username.
   * @param {bigint|number|string|undefined} [organizationId] - Org esperada si el mismo userName existe en varios tenants.
   * @returns {Promise<Object|undefined>} User row or undefined.
   */
  async getUserUsername(username, organizationId = undefined) {
    // Login ocurre sin tenantContext ni GUC de Postgres. La política RLS en User
    // exige organization_id = current_setting(...) o bypass; sin SET la fila no
    // aparece y el login siempre devuelve 401. Transacción + bypass local solo
    // para esta lectura (no filtra al pool).
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_tenant', 'on', true)`;
      const matches = await tx.user.findMany({
        where: { userName: username },
        include: { role: true, organization: true, empleado: true },
      });
      if (!matches.length) return undefined;
      const hint =
        organizationId !== undefined && organizationId !== null && String(organizationId).trim() !== ""
          ? BigInt(String(organizationId).trim())
          : null;
      if (hint !== null) {
        return matches.find((u) => BigInt(u.organizationId) === hint) ?? undefined;
      }
      if (matches.length === 1) return matches[0];
      const err = new Error(
        "Varias organizaciones tienen un usuario con este nombre. " +
          "Envía organization_id (id numérico de la organización) en el cuerpo del login."
      );
      err.code = "AMBIGUOUS_USERNAME";
      err.organizations = matches.map((u) => ({
        id: String(u.organizationId),
        nombre: u.organization?.nombre ?? "",
      }));
      throw err;
    });

    if (!user) return undefined;

    return {
      user_name: user.userName,
      user_id: user.userId,
      department_id: user.departmentId,
      password: user.password,
      active: user.active,
      role_name: user.role?.roleName,
      organization_id: user.organizationId,
      organization_kind: user.organization?.kind,
      organization_status: user.organization?.status,
      no_empleado: user.noEmpleado,
      empleado_ceco: user.empleado?.ceco ?? null,
      empleado_proveedor: user.empleado?.proveedor ?? null,
      empleado_jefe_inmediato: user.empleado?.jefeInmediato ?? null,
    };
  },

  /**
   * Get user wallet by user ID.
   * @param {string|number} userId - User ID.
   * @returns {Promise<Object|undefined>} User row with wallet or undefined.
   */
  async getUserWallet(userId) {
    const user = await prisma.user.findUnique({
      where: { userId: Number(userId) },
      select: {
        userId: true,
        userName: true,
        wallet: true,
      },
    });

    if (!user) return undefined;

    return {
      user_id: user.userId,
      user_name: user.userName,
      wallet: user.wallet,
    };
  },
};

export default User;
