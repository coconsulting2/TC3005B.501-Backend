/**
 * @module approvalSubstituteModel
 * @description Data access for approval substitutes and stale approvals.
 */
import prisma from "../database/config/prisma.js";

const STALE_HOURS = 48;

const ApprovalSubstituteModel = {
  async listByApprover(approverId) {
    return prisma.$queryRaw`
      SELECT
        id,
        approver_id AS "approverId",
        substitute_id AS "substituteId",
        valid_from AS "validFrom",
        valid_to AS "validTo"
      FROM approval_substitutes
      WHERE approver_id = ${Number(approverId)}
      ORDER BY valid_from DESC, id DESC
    `;
  },

  async createSubstitute({ approverId, substituteId, validFrom, validTo }) {
    const rows = await prisma.$queryRaw`
      INSERT INTO approval_substitutes
        (approver_id, substitute_id, valid_from, valid_to)
      VALUES
        (${Number(approverId)}, ${Number(substituteId)}, ${validFrom}, ${validTo})
      RETURNING
        id,
        approver_id AS "approverId",
        substitute_id AS "substituteId",
        valid_from AS "validFrom",
        valid_to AS "validTo"
    `;
    return rows[0] ?? null;
  },

  async deleteSubstitute(id, approverId) {
    const rows = await prisma.$queryRaw`
      DELETE FROM approval_substitutes
      WHERE id = ${Number(id)}
        AND approver_id = ${Number(approverId)}
      RETURNING id
    `;
    return (rows[0]?.id ?? null) !== null;
  },

  async getUserRoleName(userId) {
    const rows = await prisma.$queryRaw`
      SELECT r.role_name AS "roleName"
      FROM "User" u
      JOIN "Role" r ON r.role_id = u.role_id
      WHERE u.user_id = ${Number(userId)}
      LIMIT 1
    `;
    return rows[0]?.roleName ?? null;
  },

  async getActiveSubstitute(approverId, nowDate) {
    const rows = await prisma.$queryRaw`
      SELECT
        id,
        approver_id AS "approverId",
        substitute_id AS "substituteId",
        valid_from AS "validFrom",
        valid_to AS "validTo"
      FROM approval_substitutes
      WHERE approver_id = ${Number(approverId)}
        AND valid_from <= ${nowDate}
        AND valid_to >= ${nowDate}
      ORDER BY valid_from DESC, id DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  },

  async listStalePendingRequests(nowDate) {
    return prisma.$queryRaw`
      SELECT
        r.request_id AS "requestId",
        r.request_status_id AS "requestStatusId",
        r.workflow_pre_snapshot AS "workflowPreSnapshot",
        r.last_mod_date AS "lastModDate"
      FROM "Request" r
      WHERE r.request_status_id IN (2, 3)
        AND r.last_mod_date <= (${nowDate}::timestamptz - (${STALE_HOURS} || ' hour')::interval)
    `;
  },

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

  async createAlert(requestId, messageId) {
    await prisma.alert.create({
      data: {
        requestId: Number(requestId),
        messageId: Number(messageId),
      },
    });
  },
};

export default ApprovalSubstituteModel;
