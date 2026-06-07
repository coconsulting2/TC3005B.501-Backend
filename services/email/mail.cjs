/**
 * @module mail
 * @description Email notification service using Nodemailer and Gmail SMTP.
 * Sends a styled HTML email to the applicant whenever their travel request status changes.
 * Respects the user's email notification preference (M3-006).
 */
require("dotenv").config();
const nodemailer = require("nodemailer");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const currentDate = new Date().toJSON().slice(0, 10);

const smtpHost = process.env.MAIL_SMTP_HOST || "smtp.gmail.com";
const smtpPort = Number(process.env.MAIL_SMTP_PORT || 465);
const smtpSecure = process.env.MAIL_SMTP_SECURE !== "false";

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD,
  },
});

/**
 * Sends an HTML email notifying the applicant of a travel request status change.
 * Checks the user's email notification preference before sending.
 * If the user has disabled email notifications, the send is silently skipped.
 *
 * @param {string} email - Recipient email address (decrypted before calling)
 * @param {string} username - Recipient's display name
 * @param {string|number} request_id - ID of the travel request
 * @param {string} status - New status label to display in the email
 * @param {{ userId?: number, customSubject?: string, customHtml?: string }} [options]
 * @returns {Promise<void>}
 * @throws {Error} If Nodemailer fails to send the email
 */
const Mail = async (email, username, request_id, status, options = {}) => {
  const { userId, customSubject, customHtml } = options;

  if (!process.env.MAIL_USER || !process.env.MAIL_PASSWORD) {
    console.warn("Mail skipped: MAIL_USER or MAIL_PASSWORD not configured");
    return;
  }

  // --- M3-006: Check email preference (emails are encrypted in DB — use userId) ---
  try {
    const user = userId
      ? await prisma.user.findUnique({
          where: { userId: Number(userId) },
          include: { preference: true },
        })
      : null;

    if (user?.preference && user.preference.emailNotif === false) {
      return;
    }
  } catch (prefError) {
    console.error("Could not check email preference, sending anyway:", prefError);
  }

  const fromAddress = process.env.MAIL_FROM || process.env.MAIL_USER;
  const defaultHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Actualización de tu solicitud</title>
</head>
<body style="font-family: Arial, sans-serif; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    
    <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
      <tr>
        <td style="width: 100px; vertical-align: middle;">
          <img src="https://res.cloudinary.com/dw3ipwzwz/image/upload/v1749059816/Logo101Cocons%C3%BClting_p04mhi.png" alt="Logo del portal" style="max-width: 70px; height: auto;">
        </td>
        <td style="text-align: left; vertical-align: middle;">
          <h2 style=" margin: 0;">Actualización de tu solicitud de viaje</h2>
        </td>
      </tr>
    </table>

    <p>Hola <strong>${username}</strong>,</p>

    <p>Queremos informarte que el estado de tu solicitud de viaje ha cambiado. A continuación te compartimos los nuevos detalles:</p>

    <ul>
      <li><strong>Número de solicitud: </strong>${request_id}</li>
      <li><strong>Estado actual: </strong> ${status}</li>
      <li><strong>Fecha de actualización:</strong> ${currentDate}</li>
    </ul>

    <p>Si deseas consultar más detalles, puedes ingresar a tu portal para revisar toda la información y dar seguimiento a tu viaje. Saludos Coordiales.</p>
  </div>
</body>
</html>
    `;

  const mailOptions = {
    from: `"Portal de Viajes" <${fromAddress}>`,
    to: email,
    subject: customSubject || "Actualización de Solicitud de Viaje",
    html: customHtml || defaultHtml,
  };
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email: ", error, email);
    throw new Error("Error sending email");
  }
};

exports.Mail = Mail;
