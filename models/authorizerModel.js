/**
 * @module authorizerModel
 * @description Data access layer for authorizer-related queries using Prisma.
 */
import { SolicitudHistorialAccion } from "@prisma/client";
import prisma from "../database/config/prisma.js";

export { SolicitudHistorialAccion };

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
   * Role name for workflow checks (evita depender de IDs numéricos entre seeds).
   * @param {number} userId
   * @returns {Promise<string|null>}
   */
  async getUserRoleName(userId) {
    const user = await prisma.user.findUnique({
      where: { userId: Number(userId) },
      include: { role: true },
    });
    return user?.role?.roleName ?? null;
  },

  /**
   * Estado y snapshot pre-viaje para autorización dinámica (M2-004).
   * @param {number} requestId
   */
  async getRequestAuthorizationContext(requestId) {
    const row = await prisma.request.findUnique({
      where: { requestId: Number(requestId) },
      select: {
        requestStatusId: true,
        workflowPreSnapshot: true,
        requestedFee: true,
        userId: true,
      },
    });
    return row;
  },

  /**
   * @param {number} userId
   * @returns {Promise<number|null>} null = sin tope configurado en el rol
   */
  async getUserMaxApprovalAmount(userId) {
    const user = await prisma.user.findUnique({
      where: { userId: Number(userId) },
      include: { role: true },
    });
    const v = user?.role?.maxApprovalAmount;
    if (v === undefined || v === null) {
      return null;
    }
    return Number(v);
  },

  /**
   * Transición atómica: actualiza Request y registra solicitud_historial (M2-005).
   * @param {number} requestId
   * @param {{ statusId: number, workflowPreSnapshot?: object | null }} patch
   * @param {number} actorUserId
   * @param {import("@prisma/client").SolicitudHistorialAccion} accion
   * @param {string|null} [comentario]
   */
  async applyWorkflowAction(requestId, patch, actorUserId, accion, comentario = null) {
    const rid = Number(requestId);
    const uid = Number(actorUserId);
    await prisma.$transaction(async (tx) => {
      const data = { requestStatusId: Number(patch.statusId) };
      if (Object.prototype.hasOwnProperty.call(patch, "workflowPreSnapshot")) {
        data.workflowPreSnapshot = patch.workflowPreSnapshot;
      }
      await tx.request.update({
        where: { requestId: rid },
        data,
      });
      await tx.solicitudHistorial.create({
        data: {
          requestId: rid,
          userId: uid,
          accion,
          comentario: comentario ?? null,
        },
      });
    });
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
