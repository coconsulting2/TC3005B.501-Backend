/**
 * @module authorizerModel
 * @description Data access layer for authorizer-related queries using Prisma.
 */
import prisma from "../database/config/prisma.js";

const Authorizer = {
  /**
   * Retrieve alerts for a department filtered by request status.
   * @param {number} id - Department ID.
   * @param {number} statusId - Request status ID to filter by.
   * @param {number} n - Max number of alerts to return (0 = no limit).
   * @returns {Promise<Array<Object>>} Alert rows.
   */
  async getAlerts(id, statusId, n) {
    const alerts = await prisma.alert.findMany({
      where: {
        request: {
          user: { departmentId: Number(id) },
          requestStatusId: Number(statusId),
        },
      },
      include: {
        request: {
          include: { user: true },
        },
        alertMessage: true,
      },
      orderBy: { alertDate: "desc" },
      ...(n !== 0 ? { take: Number(n) } : {}),
    });

    return alerts.map((a) => ({
      alert_id: a.alertId,
      user_name: a.request?.user?.userName,
      request_id: a.requestId,
      message_text: a.alertMessage?.messageText,
      alert_date: a.alertDate.toISOString().split("T")[0],
      alert_time: a.alertDate.toISOString().split("T")[1].split(".")[0],
    }));
  },

  /**
   * Get the role ID for a given user.
   * @param {number} userId - User ID.
   * @returns {Promise<number|null>} Role ID or null if not found.
   */
  async getUserRole(userId) {
    const user = await prisma.user.findUnique({
      where: { userId: Number(userId) },
      select: { roleId: true },
    });
    return user ? user.roleId : null;
  },

  /**
   * Update a travel request status (approve flow).
   * @param {number} requestId - Request ID.
   * @param {number} statusId - New status ID to set.
   * @returns {Promise<Object>} Updated request.
   */
  async authorizeTravelRequest(requestId, statusId) {
    return await prisma.request.update({
      where: { requestId: Number(requestId) },
      data: { requestStatusId: Number(statusId) },
    });
  },

  /**
   * Decline a travel request by setting its status to 10.
   * @param {number} requestId - Request ID.
   * @returns {Promise<boolean>} True if the query executed successfully.
   */
  async declineTravelRequest(requestId) {
    await prisma.request.update({
      where: { requestId: Number(requestId) },
      data: { requestStatusId: 10 },
    });
    return true;
  },
};

export default Authorizer;
