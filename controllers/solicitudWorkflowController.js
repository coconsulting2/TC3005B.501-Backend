/**
 * @module solicitudWorkflowController
 * @description POST /api/solicitudes/:id/aprobar|rechazar|reasignar (M2-005).
 */
import authorizerServices from "../services/authorizerService.js";
import { Mail } from "../services/email/mail.cjs";
import mailData from "../services/email/mailData.js";
import prisma from "../database/config/prisma.js";
import { buildSolicitudJourney } from "../services/solicitudJourneyService.js";

/** Permisos que permiten ver historial de solicitudes ajenas en el mismo tenant. */
const HISTORIAL_BROAD_VIEW_PERMISSIONS = [
  "travel_request:view_any",
  "travel_request:authorize",
  "travel_agent:attend",
  "accounts_payable:attend",
];

/**
 * @param {Set<string>|undefined} permissionSet
 * @returns {boolean}
 */
function canViewAnyTravelRequestHistorial(permissionSet) {
  if (!(permissionSet instanceof Set)) return false;
  return HISTORIAL_BROAD_VIEW_PERMISSIONS.some((code) => permissionSet.has(code));
}

/**
 *
 * @param request_id
 */
async function notifyApplicantSafe(request_id) {
  try {
    const { user_email, user_name, status } = await mailData(request_id);
    await Mail(user_email, user_name, request_id, status);
  } catch (mailErr) {
    console.error(
      "solicitudWorkflow: correo no enviado (operación ya aplicada):",
      mailErr,
    );
  }
}

/**
 * POST /api/solicitudes/:id/aprobar
 * @param req
 * @param res
 */
export const approveSolicitud = async (req, res) => {
  const request_id = Number(req.params.id);
  const user_id = Number(req.user.user_id);

  try {
    const result = await authorizerServices.authorizeRequest(
      request_id,
      user_id,
    );
    await notifyApplicantSafe(request_id);
    return res.status(200).json({
      message: "Solicitud actualizada correctamente",
      new_status: result.new_status,
      outcome: result.outcome,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("approveSolicitud:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/solicitudes/:id/rechazar  body: { comentario }
 * @param req
 * @param res
 */
export const rejectSolicitud = async (req, res) => {
  const request_id = Number(req.params.id);
  const user_id = Number(req.user.user_id);
  const comentario = req.body?.comentario ?? req.body?.comment;

  try {
    const result = await authorizerServices.declineRequest(
      request_id,
      user_id,
      comentario,
    );
    await notifyApplicantSafe(request_id);
    return res.status(200).json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("rejectSolicitud:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/solicitudes/:id/reasignar  body: { userId, motivo }
 * @param req
 * @param res
 */
export const reassignSolicitud = async (req, res) => {
  const request_id = Number(req.params.id);
  const actor_user_id = Number(req.user.user_id);
  const target_user_id = req.body?.userId ?? req.body?.user_id;
  const motivo = req.body?.motivo ?? req.body?.reason;

  try {
    const result = await authorizerServices.reassignRequest(
      request_id,
      actor_user_id,
      Number(target_user_id),
      motivo,
    );
    await notifyApplicantSafe(request_id);
    return res.status(200).json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("reassignSolicitud:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/solicitudes/:id/historial
 * @param req
 * @param res
 */
export const getSolicitudHistorial = async (req, res) => {
  const request_id = Number(req.params.id);
  const user_id = Number(req.user.user_id);
  const org_id = BigInt(req.tenant?.organizationId ?? req.user.organization_id);

  try {
    const request = await prisma.request.findUnique({
      where: { requestId: request_id },
      select: {
        userId: true,
        organizationId: true,
        requestStatusId: true,
        creationDate: true,
        workflowPreSnapshot: true,
        requestStatus: { select: { status: true } },
        routeRequests: {
          include: {
            route: { select: { hotelNeeded: true, planeNeeded: true } },
          },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ error: "Solicitud no encontrada" });
    }

    if (request.organizationId !== org_id) {
      return res.status(403).json({ error: "Acceso denegado" });
    }

    if (
      !canViewAnyTravelRequestHistorial(req.user.permissionSet) &&
      request.userId !== user_id
    ) {
      return res.status(403).json({ error: "Acceso denegado" });
    }

    const historial = await prisma.solicitudHistorial.findMany({
      where: { requestId: request_id },
      include: {
        user: {
          select: {
            userName: true,
            role: { select: { roleName: true } }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    const journey = buildSolicitudJourney({
      currentStatusId: request.requestStatusId,
      currentStatusLabel: request.requestStatus?.status ?? "",
      workflowPreSnapshot: request.workflowPreSnapshot,
      routeRequests: request.routeRequests,
      creationDate: request.creationDate,
      historial,
    });

    return res.status(200).json(journey);
  } catch (error) {
    console.error("getSolicitudHistorial:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
