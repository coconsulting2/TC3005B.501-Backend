/**
 * @module authorizerModel
 * @description Data access layer for authorizer-related queries using Prisma.
 */
import { SolicitudHistorialAccion } from "@prisma/client";
import prisma from "../database/config/prisma.js";

export { SolicitudHistorialAccion };

const Authorizer = {
  /**
   * Alertas para N1/N2: solicitudes en el estado que les corresponde y donde el
   * snapshot del workflow los designa como aprobador (o, fallback, mismo depto del solicitante).
   *
   * @param {object} params
   * @param {number} params.authorizerUserId
   * @param {string} params.roleName - "N1" | "N2"
   * @param {number} params.statusId - request_status_id (2=N1, 3=N2)
   * @param {number} [params.departmentId] - fallback legacy por depto del solicitante
   * @param {number} params.limit - máximo de filas (0 = sin límite)
   * @returns {Promise<Array<Object>>}
   */
  async getAlertsForAuthorizer({
    authorizerUserId,
    roleName,
    statusId,
    departmentId,
    limit,
  }) {
    const snapshotPath = roleName === "N2" ? ["n2UserId"] : ["n1UserId"];
    const approverFilter = {
      workflowPreSnapshot: {
        path: snapshotPath,
        equals: Number(authorizerUserId),
      },
    };

    /** @type {import('@prisma/client').Prisma.AlertWhereInput} */
    const where = {
      request: {
        requestStatusId: Number(statusId),
        active: true,
        OR: [
          approverFilter,
          ...(departmentId != null
            ? [{ user: { departmentId: Number(departmentId) } }]
            : []),
        ],
      },
    };

    const alerts = await prisma.alert.findMany({
      where,
      include: {
        request: {
          include: { user: true },
        },
        alertMessage: true,
      },
      orderBy: { alertDate: "desc" },
      ...(limit !== 0 ? { take: Number(limit) } : {}),
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
   * @deprecated Usar getAlertsForAuthorizer — conservado por compatibilidad de ruta.
   */
  async getAlerts(id, statusId, n) {
    return this.getAlertsForAuthorizer({
      authorizerUserId: 0,
      roleName: "N1",
      statusId,
      departmentId: id,
      limit: n,
    });
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
   * Obtiene jefe directo (adjacency list) del usuario.
   * @param {number} userId
   * @returns {Promise<number|null>}
   */
  async getManagerUserId(userId) {
    const user = await prisma.user.findUnique({
      where: { userId: Number(userId) },
      select: { managerUserId: true },
    });
    if (!user) return null;
    return user.managerUserId == null ? null : Number(user.managerUserId);
  },

  /**
   * Obtiene subordinados directos de un usuario.
   * @param {number} managerUserId
   * @returns {Promise<number[]>}
   */
  async getDirectSubordinates(managerUserId) {
    const rows = await prisma.user.findMany({
      where: { managerUserId: Number(managerUserId), active: true },
      select: { userId: true },
      orderBy: { userId: "asc" },
    });
    return rows.map((r) => Number(r.userId));
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
