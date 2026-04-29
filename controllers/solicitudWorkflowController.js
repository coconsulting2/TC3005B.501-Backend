/**
 * @module solicitudWorkflowController
 * @description POST /api/solicitudes/:id/aprobar|rechazar|reasignar (M2-005).
 */
import authorizerServices from "../services/authorizerService.js";
import { Mail } from "../services/email/mail.cjs";
import mailData from "../services/email/mailData.js";

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
