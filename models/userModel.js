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
        destination_country: firstRoute?.destinationCountry?.countryName || null,
        beginning_date: firstRoute?.beginningDate || null,
        ending_date: firstRoute?.endingDate || null,
        request_status: r.requestStatus.status,
      };
    });
  },

  /**
   * Get user by username (for auth).
   * @param {string} username - Username.
   * @returns {Promise<Object|undefined>} User row or undefined.
   */
  async getUserUsername(username) {
    const user = await prisma.user.findUnique({
      where: { userName: username },
      include: { role: true },
    });

    if (!user) return undefined;

    return {
      user_name: user.userName,
      user_id: user.userId,
      department_id: user.departmentId,
      password: user.password,
      active: user.active,
      role_name: user.role?.roleName,
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
