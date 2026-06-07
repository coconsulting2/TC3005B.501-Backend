/**
 * @module workflowNotificationService
 * @description Notificaciones de workflow (US-20): in-app (campana) + email según plantillas y preferencias.
 */
import prisma from "../database/config/prisma.js";
import { decrypt } from "../middleware/decryption.js";
import { createNotification } from "./notificationService.js";
import { Mail } from "./email/mail.cjs";

const DEFAULT_LOCALE = "es-MX";

/** Mensajes por defecto si la org aún no tiene plantilla INAPP/EMAIL en BD. */
const FALLBACK_TEMPLATES = {
  "request.submitted": {
    INAPP: "Tu solicitud #{{requestId}} fue enviada para revisión.",
    EMAIL: {
      subject: "Tu solicitud de viáticos fue enviada",
      body: "Hola {{userName}}, tu solicitud #{{requestId}} fue enviada para revisión.",
    },
  },
  "request.approved": {
    INAPP: "Tu solicitud #{{requestId}} fue aprobada por {{approverName}}.",
    EMAIL: {
      subject: "Tu solicitud fue aprobada",
      body: "Tu solicitud #{{requestId}} fue aprobada por {{approverName}}.",
    },
  },
  "request.rejected": {
    INAPP: "Tu solicitud #{{requestId}} fue rechazada. Motivo: {{reason}}.",
    EMAIL: {
      subject: "Tu solicitud fue rechazada",
      body: "Tu solicitud #{{requestId}} fue rechazada. Motivo: {{reason}}.",
    },
  },
  "request.escalated": {
    INAPP: "La solicitud #{{requestId}} de {{userName}} requiere tu aprobación (N2).",
    EMAIL: {
      subject: "Solicitud escalada — requiere tu aprobación",
      body:
        "Hola {{approverName}}, la solicitud #{{requestId}} de {{userName}} fue escalada y requiere tu revisión.",
    },
  },
  "request.awaiting_approval": {
    INAPP: "Nueva solicitud #{{requestId}} de {{userName}} pendiente de tu aprobación.",
    EMAIL: {
      subject: "Nueva solicitud de viáticos pendiente de aprobación",
      body:
        "Hola {{approverName}}, tienes una nueva solicitud #{{requestId}} de {{userName}} pendiente de revisión.",
    },
  },
};

/**
 * @param {string} template
 * @param {Record<string, string|number>} vars
 * @returns {string}
 */
function renderTemplate(template, vars) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, String(value ?? ""));
  }
  return out;
}

/**
 * @param {bigint|number} organizationId
 * @param {string} code
 * @param {"EMAIL"|"INAPP"} channel
 * @returns {Promise<{ subject: string|null, body: string }|null>}
 */
async function loadOrgTemplate(organizationId, code, channel) {
  const row = await prisma.notificationTemplate.findFirst({
    where: {
      organizationId: BigInt(organizationId),
      code,
      channel,
      locale: DEFAULT_LOCALE,
    },
    select: { subject: true, body: true },
  });
  if (!row?.body) return null;
  return { subject: row.subject ?? null, body: row.body };
}

/**
 * @param {string} code
 * @param {"EMAIL"|"INAPP"} channel
 * @param {Record<string, string|number>} vars
 * @param {bigint|number|null} organizationId
 * @returns {{ subject: string|null, body: string }}
 */
async function resolveMessage(code, channel, vars, organizationId) {
  const fromDb =
    organizationId != null
      ? await loadOrgTemplate(organizationId, code, channel)
      : null;
  const fallback = FALLBACK_TEMPLATES[code]?.[channel];

  if (channel === "EMAIL") {
    const tpl = fromDb ?? fallback;
    return {
      subject: renderTemplate(tpl?.subject ?? "Notificación de viáticos", vars),
      body: renderTemplate(tpl?.body ?? "", vars),
    };
  }

  const bodyTpl =
    fromDb?.body ??
    (typeof fallback === "string" ? fallback : fallback?.body) ??
    `Notificación: ${code}`;
  return { subject: null, body: renderTemplate(bodyTpl, vars) };
}

/**
 * @param {number} userId
 * @param {string} code
 * @param {Record<string, string|number>} vars
 * @param {bigint|number|null} [organizationId]
 */
async function dispatchToUser(userId, code, vars, organizationId = null) {
  const user = await prisma.user.findUnique({
    where: { userId: Number(userId) },
    include: { preference: true },
  });
  if (!user) return;

  const orgId = organizationId ?? user.organizationId;
  const emailEnabled = user.preference ? user.preference.emailNotif !== false : true;
  const appEnabled = user.preference ? user.preference.appNotif !== false : true;

  if (appEnabled) {
    const { body } = await resolveMessage(code, "INAPP", vars, orgId);
    await createNotification(Number(userId), body);
  }

  if (emailEnabled) {
    const { subject, body } = await resolveMessage(code, "EMAIL", vars, orgId);
    let userEmail;
    try {
      userEmail = decrypt(user.email);
    } catch {
      console.warn(`workflowNotification: no se pudo desencriptar email userId=${userId}`);
      return;
    }
    await Mail(userEmail, user.userName, vars.requestId ?? "", vars.status ?? "", {
      userId: Number(userId),
      customSubject: subject,
      customHtml: wrapEmailHtml(user.userName, body),
    });
  }
}

/**
 * @param {string} userName
 * @param {string} bodyText
 * @returns {string}
 */
function wrapEmailHtml(userName, bodyText) {
  const safeBody = bodyText.replace(/\n/g, "<br/>");
  return `
    <p>Hola <strong>${userName}</strong>,</p>
    <p>${safeBody}</p>
    <p>Puedes ingresar al portal para revisar los detalles.</p>
  `;
}

/**
 * @param {object|null} snapshot
 * @param {1|2} tier
 * @returns {number|null}
 */
function approverFromSnapshot(snapshot, tier) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const key = tier === 1 ? "n1UserId" : "n2UserId";
  const id = snapshot[key];
  return id != null ? Number(id) : null;
}

/**
 * Carga contexto mínimo de una solicitud para notificaciones.
 * @param {number} requestId
 */
async function loadRequestContext(requestId) {
  return prisma.request.findUnique({
    where: { requestId: Number(requestId) },
    select: {
      requestId: true,
      organizationId: true,
      userId: true,
      workflowPreSnapshot: true,
      requestStatus: { select: { status: true } },
      user: { select: { userName: true } },
    },
  });
}

/**
 * Notifica al aprobador N1 cuando se envía una solicitud.
 * @param {number} requestId
 */
export async function notifyRequestSubmitted(requestId) {
  const ctx = await loadRequestContext(requestId);
  if (!ctx) return;

  const vars = {
    requestId: ctx.requestId,
    userName: ctx.user?.userName ?? "Solicitante",
    status: ctx.requestStatus?.status ?? "Primera revisión",
  };

  const n1Id = approverFromSnapshot(ctx.workflowPreSnapshot, 1);
  if (n1Id) {
    const approver = await prisma.user.findUnique({
      where: { userId: n1Id },
      select: { userName: true },
    });
    await dispatchToUser(
      n1Id,
      "request.awaiting_approval",
      {
        ...vars,
        approverName: approver?.userName ?? "Aprobador",
      },
      ctx.organizationId,
    );
  }

  await dispatchToUser(ctx.userId, "request.submitted", vars, ctx.organizationId);
}

/**
 * Notifica al solicitante tras aprobación.
 * @param {number} requestId
 * @param {number} approverUserId
 */
export async function notifyRequestApproved(requestId, approverUserId) {
  const ctx = await loadRequestContext(requestId);
  if (!ctx) return;

  const approver = await prisma.user.findUnique({
    where: { userId: Number(approverUserId) },
    select: { userName: true },
  });

  await dispatchToUser(ctx.userId, "request.approved", {
    requestId: ctx.requestId,
    approverName: approver?.userName ?? "Aprobador",
    status: ctx.requestStatus?.status ?? "Actualizado",
  }, ctx.organizationId);
}

/**
 * Notifica al solicitante tras rechazo.
 * @param {number} requestId
 * @param {string} reason
 */
export async function notifyRequestRejected(requestId, reason) {
  const ctx = await loadRequestContext(requestId);
  if (!ctx) return;

  const trimmedReason = String(reason ?? "").trim() || "Sin comentario";

  await dispatchToUser(ctx.userId, "request.rejected", {
    requestId: ctx.requestId,
    reason: trimmedReason,
    status: "Rechazado",
  }, ctx.organizationId);
}

/**
 * Notifica al aprobador N2 cuando N1 escala la solicitud.
 * @param {number} requestId
 */
export async function notifyRequestEscalated(requestId) {
  const ctx = await loadRequestContext(requestId);
  if (!ctx) return;

  const n2Id = approverFromSnapshot(ctx.workflowPreSnapshot, 2);
  if (!n2Id) return;

  const approver = await prisma.user.findUnique({
    where: { userId: n2Id },
    select: { userName: true },
  });

  await dispatchToUser(n2Id, "request.escalated", {
    requestId: ctx.requestId,
    userName: ctx.user?.userName ?? "Solicitante",
    approverName: approver?.userName ?? "Aprobador",
    status: "Segunda revisión",
  }, ctx.organizationId);
}

/**
 * Ejecuta notificación sin romper el flujo principal.
 * @param {() => Promise<void>} fn
 */
export async function notifySafe(fn) {
  try {
    await fn();
  } catch (err) {
    console.error("workflowNotification:", err?.message || err);
  }
}
