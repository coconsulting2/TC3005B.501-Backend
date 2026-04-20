/**
 * @module accountsPayableController
 * @description Handles HTTP requests for accounts payable operations (attend requests, validate receipts).
 * @author Miguel Soria
 */
import AccountsPayable from "../models/accountsPayableModel.js";
import AccountsPayableService from "../services/accountsPayableService.js";
import ComprobantesModel from "../models/comprobantesModel.js";
import { consultarCfdiWithRetries, acuseToCfdiRow } from "../services/satConsultaService.js";
import mailData from "../services/email/mailData.js";
import { Mail } from "../services/email/mail.cjs";

const EFOS_EMISOR_BLACKLIST_APPROVAL = ["100", "101", "104"];

/**
 * Lista "0, 1, 0" del modelo → true si algún tramo requiere hotel o avión.
 * @param {string} csv
 * @returns {boolean}
 */
function csvListNeedsService(csv) {
  if (!csv || typeof csv !== "string") return false;
  return csv
    .split(",")
    .map((s) => s.trim())
    .includes("1");
}

/**
 * Attends a travel request by setting the imposed fee and advancing its status.
 * Routes to travel agency (status 5) if hotel/plane is needed, otherwise to status 6.
 * @param {import('express').Request} req - Express request (params: request_id, body: { imposed_fee })
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with new status and imposed fee, or 404/400/500 error
 */
const attendTravelRequest = async (req, res) => {
    const requestId = req.params.request_id;
    const imposedFee = req.body.imposed_fee;

    try {
        const request = await AccountsPayable.requestExists(requestId);
        if (!request) {
            return res.status(404).json({ error: "Travel request not found" });
        }

        const currentStatus = request.request_status_id;

        if (currentStatus !== 4) {
            return res.status(404).json({ error: "This request cannot be attended by accounts payable" });
        }

        const hotel = request.hotel_needed_list;
        const plane = request.plane_needed_list;
        const newStatus =
            csvListNeedsService(hotel) || csvListNeedsService(plane) ? 5 : 6;

        const updated = await AccountsPayable.attendTravelRequest(requestId, imposedFee, newStatus);

        if (!updated) {
            return res.status(400).json({ error: "Failed to update travel request status" });
        }

        try {
            const { user_email, user_name, request_id, status } = await mailData(requestId);
            await Mail(user_email, user_name, requestId, status);
        } catch (mailErr) {
            console.warn("[attendTravelRequest] Estado actualizado; correo no enviado:", mailErr?.message || mailErr);
        }

        return res.status(200).json({
            message: "Travel request status updated successfully",
            requestId: requestId,
            imposedFee: imposedFee,
            newStatus: newStatus,
        });
    } catch (error) {
        console.error("Error in attendTravelRequest controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Validates all receipts for a request and updates its status. Sends email notification.
 * @param {import('express').Request} req - Express request (params: request_id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with validation result
 */
const validateReceiptsHandler = async (req, res) => {
    const requestId = req.params.request_id;

    try {
        const result = await AccountsPayableService.validateReceiptsAndUpdateStatus(requestId);
        const { user_email, user_name, request_id, status } = await mailData(requestId);
        await Mail(user_email, user_name, requestId, status);
        res.status(200).json(result);
    } catch (error) {
        console.error("Error in validateReceiptsHandler:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Approves or rejects a single receipt.
 * Maps approval (1=approved→validation 2, 0=rejected→validation 3).
 * @param {import('express').Request} req - Express request (params: receipt_id, body: { approval: 0|1 })
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with receipt status update result
 */
const validateReceipt = async (req, res) => {
    const receiptId = req.params.receipt_id;
    const approval = req.body.approval;

    if (approval !== 0 && approval !== 1) {
        return res.status(400).json({
            error: "Invalid input (only values 0 or 1 accepted for approval)"
        });
    }

    try {
        const receipt = await AccountsPayable.findReceiptForValidation(receiptId);
        if (!receipt) {
            return res.status(404).json({ error: "Receipt not found" });
        }

        if (receipt.validation !== "Pendiente") {
            return res.status(404).json({ error: "Receipt already approved or rejected" });
        }

        if (approval === 1) {
            if (!receipt.cfdiComprobante) {
                return res.status(409).json({
                    error: "No hay CFDI registrado para este comprobante. No se puede aprobar el reembolso.",
                });
            }
            const c = receipt.cfdiComprobante;
            try {
                const acuse = await consultarCfdiWithRetries({
                    rfcEmisor: c.rfcEmisor,
                    rfcReceptor: c.rfcReceptor,
                    total: c.total,
                    uuid: c.uuid,
                    selloUltimos8: null,
                });
                const row = acuseToCfdiRow(acuse);
                await ComprobantesModel.updateSatAcuseByReceiptId(receiptId, row);
                if (acuse.estado !== "Vigente") {
                    return res.status(409).json({
                        error: `El SAT reporta el CFDI como '${acuse.estado}'. No se puede aprobar el reembolso.`,
                    });
                }
                if (EFOS_EMISOR_BLACKLIST_APPROVAL.includes(String(acuse.validacionEFOS))) {
                    return res.status(409).json({
                        error: "El emisor figura en lista EFOS. No se puede aprobar el reembolso.",
                    });
                }
            } catch (satErr) {
                console.error("SAT validation on approve:", satErr);
                return res.status(503).json({
                    error: "No se pudo validar el CFDI con el SAT. Intente mas tarde.",
                });
            }
        }

        const updated = await AccountsPayable.validateReceipt(receiptId, 3 - approval);

        if (!updated) {
            return res.status(400).json({ error: "Failed to update travel request status" });
        }

        const statusLabel = approval === 1 ? "Aprobado" : "Rechazado";
        const summaryLabel = approval === 1 ? "Receipt approved" : "Receipt rejected";
        const messageLabel = approval === 1
            ? "Receipt has been approved."
            : "Receipt has been rejected.";

        return res.status(200).json({
            summary: summaryLabel,
            value: {
                receipt_id: receiptId,
                new_status: statusLabel,
                message: messageLabel
            }
        });
    } catch (error) {
        console.error("Error in validateReceipt controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Retrieves expense validation records for a travel request.
 * @param {import('express').Request} req - Express request (params: request_id)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with expense validations or 404/400/500 error
 */
const getExpenseValidations = async (req, res) => {
    const requestId = Number(req.params.request_id);

    try {
        const exists = await AccountsPayable.requestExists(requestId);
        if (!exists) {
            return res.status(404).json({ error: "Travel request not found" });
        }

        const validations = await AccountsPayable.getExpenseValidations(requestId);

        if (validations) {
            return res.status(200).json(validations);
        } else {
            return res.status(400).json({ error: "Failed to retrieve expense validations" });
        }
    } catch (error) {
        console.error("Error in getExpenseValidations controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export default {
    attendTravelRequest,
    validateReceiptsHandler,
    validateReceipt,
    getExpenseValidations,
};
