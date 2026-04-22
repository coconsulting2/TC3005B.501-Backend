/**
 * @module applicantModel
 * @description Data access layer for applicant-related queries using Prisma.
 */
import prisma from "../database/config/prisma.js";
import { formatRoutes, getRequestDays, getCountryId, getCityId } from "../services/applicantService.js";
import { createRequestInsertAlert } from "../services/createRequestInsertAlert.js";
import { buildRequestWorkflowSnapshots } from "../services/buildRequestWorkflowSnapshots.js";
import { initialStatusFromLevels } from "../services/workflowRulesEngine.js";

const Applicant = {
  /**
   * Finds an applicant user by their ID.
   * @param {number} id - The user ID to search for
   * @returns {Promise<Object>} The user record
   */
  async findById(id) {
    const user = await prisma.user.findUnique({
      where: { userId: Number(id) },
    });
    if (!user) return undefined;
    return {
      user_id: user.userId,
      user_name: user.userName,
      role_id: user.roleId,
      department_id: user.departmentId,
      email: user.email,
      phone_number: user.phoneNumber,
      workstation: user.workstation,
      wallet: user.wallet,
      creation_date: user.creationDate,
      last_mod_date: user.lastModDate,
      active: user.active,
    };
  },

  /**
   * Finds the cost center and department name for a given user.
   * @param {number} userId - The user ID
   * @returns {Promise<Object>} The department name and cost center
   */
  async findCostCenterByUserId(userId) {
    const user = await prisma.user.findUnique({
      where: { userId: Number(userId) },
      include: { department: true },
    });
    if (!user || !user.department) return undefined;
    return {
      department_name: user.department.departmentName,
      costs_center: user.department.costsCenter,
    };
  },

  /**
   * Creates a new travel request with routes for a given user.
   * @param {number} userId - The ID of the requesting user
   * @param {Object} travelDetails - The travel request details including routes
   * @returns {Promise<{requestId: number, message: string}>}
   */
  async createTravelRequest(userId, travelDetails) {
    const {
      router_index,
      notes,
      requested_fee = 0,
      imposed_fee = 0,
      origin_country_name,
      origin_city_name,
      destination_country_name,
      destination_city_name,
      beginning_date,
      beginning_time,
      ending_date,
      ending_time,
      plane_needed,
      hotel_needed,
      additionalRoutes = [],
    } = travelDetails;

    const allRoutes = formatRoutes(
      {
        router_index, origin_country_name, origin_city_name,
        destination_country_name, destination_city_name,
        beginning_date, beginning_time, ending_date, ending_time,
        plane_needed, hotel_needed,
      },
      additionalRoutes,
    );

    const request_days = getRequestDays(allRoutes);

    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { userId: Number(userId) },
        include: { role: true },
      });

      const destinationCountryIds = [];
      for (const route of allRoutes) {
        const destCountryId = await getCountryId(tx, route.destination_country_name);
        if (destCountryId != null) destinationCountryIds.push(destCountryId);
      }

      const { pre, post } = await buildRequestWorkflowSnapshots(tx, {
        orgId: user.orgId,
        departmentId: user.departmentId,
        requestedFee: requested_fee,
        destinationCountryIds,
      });

      const rn = user.role?.roleName;
      let request_status;
      if (rn === "Solicitante") {
        request_status = pre ? initialStatusFromLevels(pre.levels) : 2;
      } else if (rn === "N1") request_status = 3;
      else if (rn === "N2") request_status = 4;
      else throw new Error("User role is not allowed to create a travel request");

      const request = await tx.request.create({
        data: {
          userId: Number(userId),
          requestStatusId: request_status,
          notes,
          requestedFee: requested_fee,
          imposedFee: imposed_fee,
          requestDays: request_days,
          ...(pre || post
            ? {
              workflowPreSnapshot: pre ?? undefined,
              workflowPostSnapshot: post ?? undefined,
            }
            : {}),
        },
      });
      await createRequestInsertAlert(tx, request);

      for (const route of allRoutes) {
        const originCountryId = await getCountryId(tx, route.origin_country_name);
        const destCountryId = await getCountryId(tx, route.destination_country_name);
        const originCityId = await getCityId(tx, route.origin_city_name);
        const destCityId = await getCityId(tx, route.destination_city_name);

        const createdRoute = await tx.route.create({
          data: {
            idOriginCountry: originCountryId,
            idOriginCity: originCityId,
            idDestinationCountry: destCountryId,
            idDestinationCity: destCityId,
            routerIndex: route.router_index,
            planeNeeded: route.plane_needed || false,
            hotelNeeded: route.hotel_needed || false,
            beginningDate: route.beginning_date ? new Date(route.beginning_date) : null,
            beginningTime: route.beginning_time ? new Date(`1970-01-01T${route.beginning_time}`) : null,
            endingDate: route.ending_date ? new Date(route.ending_date) : null,
            endingTime: route.ending_time ? new Date(`1970-01-01T${route.ending_time}`) : null,
          },
        });

        await tx.routeRequest.create({
          data: {
            requestId: request.requestId,
            routeId: createdRoute.routeId,
          },
        });
      }

      return {
        requestId: request.requestId,
        message: "Travel request successfully created",
      };
    });
  },

  /**
   * Edits an existing travel request by replacing its routes and updating details.
   * @param {number} requestId - The ID of the request to edit
   * @param {Object} travelChanges - The updated travel request details
   * @returns {Promise<{requestId: number, message: string}>}
   */
  async editTravelRequest(requestId, travelChanges) {
    const {
      router_index,
      notes,
      requested_fee = 0,
      imposed_fee = 0,
      origin_country_name,
      origin_city_name,
      destination_country_name,
      destination_city_name,
      beginning_date,
      beginning_time,
      ending_date,
      ending_time,
      plane_needed,
      hotel_needed,
      additionalRoutes = [],
    } = travelChanges;

    const allRoutes = formatRoutes(
      {
        router_index, origin_country_name, origin_city_name,
        destination_country_name, destination_city_name,
        beginning_date, beginning_time, ending_date, ending_time,
        plane_needed, hotel_needed,
      },
      additionalRoutes,
    );

    const request_days = getRequestDays(allRoutes);

    return await prisma.$transaction(async (tx) => {
      // Update the request
      await tx.request.update({
        where: { requestId: Number(requestId) },
        data: {
          notes,
          requestedFee: requested_fee,
          imposedFee: imposed_fee,
          requestDays: request_days,
        },
      });

      // Delete old route links and routes
      const oldRouteRequests = await tx.routeRequest.findMany({
        where: { requestId: Number(requestId) },
        select: { routeId: true },
      });

      await tx.routeRequest.deleteMany({
        where: { requestId: Number(requestId) },
      });

      for (const rr of oldRouteRequests) {
        if (rr.routeId) {
          await tx.route.delete({ where: { routeId: rr.routeId } });
        }
      }

      // Insert new routes
      for (const route of allRoutes) {
        const originCountryId = await getCountryId(tx, route.origin_country_name);
        const destCountryId = await getCountryId(tx, route.destination_country_name);
        const originCityId = await getCityId(tx, route.origin_city_name);
        const destCityId = await getCityId(tx, route.destination_city_name);

        const createdRoute = await tx.route.create({
          data: {
            idOriginCountry: originCountryId,
            idOriginCity: originCityId,
            idDestinationCountry: destCountryId,
            idDestinationCity: destCityId,
            routerIndex: route.router_index,
            planeNeeded: route.plane_needed || false,
            hotelNeeded: route.hotel_needed || false,
            beginningDate: route.beginning_date ? new Date(route.beginning_date) : null,
            beginningTime: route.beginning_time ? new Date(`1970-01-01T${route.beginning_time}`) : null,
            endingDate: route.ending_date ? new Date(route.ending_date) : null,
            endingTime: route.ending_time ? new Date(`1970-01-01T${route.ending_time}`) : null,
          },
        });

        await tx.routeRequest.create({
          data: {
            requestId: Number(requestId),
            routeId: createdRoute.routeId,
          },
        });
      }

      return {
        requestId: Number(requestId),
        message: "Travel request successfully updated",
      };
    });
  },

  /**
   * Gets the current status ID of a request.
   * @param {number} requestId - The request ID
   * @returns {Promise<number|null>}
   */
  async getRequestStatus(requestId) {
    const request = await prisma.request.findUnique({
      where: { requestId: Number(requestId) },
      select: { requestStatusId: true },
    });
    return request ? request.requestStatusId : null;
  },

  /**
   * Cancels a travel request by setting its status to 9 (Cancelado).
   * @param {number} requestId - The request ID to cancel
   * @returns {Promise<boolean>}
   */
  async cancelTravelRequest(requestId) {
    await prisma.request.update({
      where: { requestId: Number(requestId) },
      data: { requestStatusId: 9 },
    });
    return true;
  },

  /**
   * Gets all completed, cancelled, or rejected requests for a user.
   * Replaces the query against RequestWithRouteDetails view.
   * @param {number} userId - The user ID
   * @returns {Promise<Array<Object>>}
   */
  async getCompletedRequests(userId) {
    const requests = await prisma.request.findMany({
      where: {
        userId: Number(userId),
        requestStatus: {
          status: { in: ["Finalizado", "Cancelado", "Rechazado"] },
        },
      },
      include: {
        requestStatus: true,
        routeRequests: {
          include: {
            route: {
              include: {
                originCountry: true,
                destinationCountry: true,
              },
            },
          },
          orderBy: { route: { routerIndex: "asc" } },
        },
      },
    });

    return requests.map((r) => {
      const routes = r.routeRequests.map((rr) => rr.route).filter(Boolean);
      return {
        request_id: r.requestId,
        origin_countries: [...new Set(routes.map((rt) => rt.originCountry?.countryName).filter(Boolean))].join(", "),
        destination_countries: [...new Set(routes.map((rt) => rt.destinationCountry?.countryName).filter(Boolean))].join(", "),
        beginning_dates: [...new Set(routes.map((rt) => rt.beginningDate?.toISOString().split("T")[0]).filter(Boolean))].join(", "),
        ending_dates: [...new Set(routes.map((rt) => rt.endingDate?.toISOString().split("T")[0]).filter(Boolean))].join(", "),
        creation_date: r.creationDate,
        status: r.requestStatus.status,
      };
    });
  },

  /**
   * Gets all active (non-finalized) travel requests for a user.
   * @param {number} userId - The user ID
   * @returns {Promise<Array<Object>>}
   */
  async getApplicantRequests(userId) {
    const requests = await prisma.request.findMany({
      where: {
        userId: Number(userId),
        requestStatusId: { notIn: [8, 9, 10] },
      },
      include: {
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
    });

    return requests.map((r) => {
      const firstRoute = r.routeRequests[0]?.route;
      return {
        request_id: r.requestId,
        status: r.requestStatus.status,
        destination_country: firstRoute?.destinationCountry?.countryName || null,
        beginning_date: firstRoute?.beginningDate || null,
        ending_date: firstRoute?.endingDate || null,
      };
    });
  },

  /**
   * Gets detailed information for a single travel request including all routes.
   * Returns one row per route to match the old SQL shape.
   * @param {number} requestId - The request ID to look up
   * @returns {Promise<Array<Object>>}
   */
  async getApplicantRequest(requestId) {
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

    if (request.routeRequests.length === 0) {
      return [{
        request_id: request.requestId,
        request_status: request.requestStatus.status,
        notes: request.notes,
        requested_fee: request.requestedFee,
        imposed_fee: request.imposedFee,
        request_days: request.requestDays,
        creation_date: request.creationDate,
        last_mod_date: request.lastModDate,
        user_name: request.user?.userName,
        user_email: request.user?.email,
        user_phone_number: request.user?.phoneNumber,
        origin_country: null,
        origin_city: null,
        destination_country: null,
        destination_city: null,
        router_index: null,
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
        requested_fee: request.requestedFee,
        imposed_fee: request.imposedFee,
        request_days: request.requestDays,
        creation_date: request.creationDate,
        last_mod_date: request.lastModDate,
        user_name: request.user?.userName,
        user_email: request.user?.email,
        user_phone_number: request.user?.phoneNumber,
        origin_country: route?.originCountry?.countryName,
        origin_city: route?.originCity?.cityName,
        destination_country: route?.destinationCountry?.countryName,
        destination_city: route?.destinationCity?.cityName,
        router_index: route?.routerIndex,
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
   * Inserts multiple receipts in a single transaction.
   * @param {Array<{receipt_type_id: number, request_id: number, amount: number}>} receipts
   * @returns {Promise<number>} Number of inserted rows
   */
  async createExpenseBatch(receipts) {
    const creates = receipts.map((r) =>
      prisma.receipt.create({
        data: {
          receiptTypeId: r.receipt_type_id,
          requestId: r.request_id,
          amount: r.amount,
        },
      })
    );
    const results = await prisma.$transaction(creates);
    return results.length;
  },

  /**
   * Creates a draft travel request with status 1 (Borrador).
   * @param {number} userId - The ID of the requesting user
   * @param {Object} savedDetails - The draft travel request details
   * @returns {Promise<{requestId: number, message: string}>}
   */
  async createDraftTravelRequest(userId, savedDetails) {
    const {
      router_index = 0,
      notes = "",
      requested_fee = 0,
      imposed_fee = 0,
      origin_country_name = "notSelected",
      origin_city_name = "notSelected",
      destination_country_name = "notSelected",
      destination_city_name = "notSelected",
      beginning_date = "0000-01-01",
      beginning_time = "00:00:00",
      ending_date = "0000-01-01",
      ending_time = "00:00:00",
      plane_needed = false,
      hotel_needed = false,
      additionalRoutes = [],
    } = savedDetails;

    const allRoutes = formatRoutes(
      {
        router_index, origin_country_name, origin_city_name,
        destination_country_name, destination_city_name,
        beginning_date, beginning_time, ending_date, ending_time,
        plane_needed, hotel_needed,
      },
      additionalRoutes,
    );

    const request_days = getRequestDays(allRoutes);

    return await prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          userId: Number(userId),
          requestStatusId: 1,
          notes,
          requestedFee: requested_fee,
          imposedFee: imposed_fee,
          requestDays: request_days,
        },
      });
      await createRequestInsertAlert(tx, request);

      for (const route of allRoutes) {
        const originCountryId = await getCountryId(tx, route.origin_country_name);
        const destCountryId = await getCountryId(tx, route.destination_country_name);
        const originCityId = await getCityId(tx, route.origin_city_name);
        const destCityId = await getCityId(tx, route.destination_city_name);

        const createdRoute = await tx.route.create({
          data: {
            idOriginCountry: originCountryId,
            idOriginCity: originCityId,
            idDestinationCountry: destCountryId,
            idDestinationCity: destCityId,
            routerIndex: route.router_index,
            planeNeeded: route.plane_needed || false,
            hotelNeeded: route.hotel_needed || false,
            beginningDate: route.beginning_date ? new Date(route.beginning_date) : null,
            beginningTime: route.beginning_time ? new Date(`1970-01-01T${route.beginning_time}`) : null,
            endingDate: route.ending_date ? new Date(route.ending_date) : null,
            endingTime: route.ending_time ? new Date(`1970-01-01T${route.ending_time}`) : null,
          },
        });

        await tx.routeRequest.create({
          data: {
            requestId: request.requestId,
            routeId: createdRoute.routeId,
          },
        });
      }

      return {
        requestId: request.requestId,
        message: "Draft travel request successfully created",
      };
    });
  },

  /**
   * Confirms a draft travel request by updating its status based on the user role.
   * @param {number} userId - The ID of the user confirming the draft
   * @param {number} requestId - The ID of the draft request to confirm
   * @returns {Promise<{requestId: number, message: string}>}
   */
  async confirmDraftTravelRequest(userId, requestId) {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { userId: Number(userId) },
        include: { role: true },
      });

      const reqRow = await tx.request.findUnique({
        where: { requestId: Number(requestId) },
        include: {
          routeRequests: {
            include: { route: true },
          },
        },
      });

      if (!reqRow) {
        throw new Error("Request not found");
      }

      const destinationCountryIds = [];
      for (const rr of reqRow?.routeRequests || []) {
        const did = rr.route?.idDestinationCountry;
        if (did != null) destinationCountryIds.push(did);
      }

      const { pre, post } = await buildRequestWorkflowSnapshots(tx, {
        orgId: user.orgId,
        departmentId: user.departmentId,
        requestedFee: reqRow.requestedFee ?? 0,
        destinationCountryIds,
      });

      const rn = user.role?.roleName;
      let request_status;
      if (rn === "Solicitante") {
        request_status = pre ? initialStatusFromLevels(pre.levels) : 2;
      } else if (rn === "N1") request_status = 3;
      else if (rn === "N2") request_status = 4;
      else throw new Error("User role is not allowed to create a travel request");

      await tx.request.update({
        where: { requestId: Number(requestId) },
        data: {
          requestStatusId: request_status,
          ...(pre || post
            ? {
              workflowPreSnapshot: pre ?? undefined,
              workflowPostSnapshot: post ?? undefined,
            }
            : {}),
        },
      });

      return {
        requestId: Number(requestId),
        message: "Draft travel request successfully confirmed",
      };
    });
  },

  /**
   * Updates a request status to the validation stage (status 7).
   * @param {number} requestId - The request ID to update
   * @returns {Promise<void>}
   */
  async updateRequestStatusToValidationStage(requestId) {
    await prisma.request.update({
      where: { requestId: Number(requestId) },
      data: { requestStatusId: 7 },
    });
  },

  /**
   * Deletes a receipt by ID.
   * @param {number} receiptId - Receipt ID to delete
   * @returns {Promise<boolean>}
   */
  async deleteReceipt(receiptId) {
    const receipt = await prisma.receipt.findUnique({
      where: { receiptId: Number(receiptId) },
    });

    if (!receipt) {
      throw new Error("Receipt not found");
    }

    await prisma.receipt.delete({
      where: { receiptId: Number(receiptId) },
    });

    return true;
  },
};

export default Applicant;
