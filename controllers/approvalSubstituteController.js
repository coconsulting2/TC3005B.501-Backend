import approvalSubstituteService from "../services/approvalSubstituteService.js";

/**
 * GET /api/approval-substitutes
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function listApprovalSubstitutes(req, res) {
  try {
    const approverId = Number(req.user.user_id);
    const rows = await approvalSubstituteService.listSubstitutes(approverId);
    return res.status(200).json(rows);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error("listApprovalSubstitutes:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/approval-substitutes
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function createApprovalSubstitute(req, res) {
  try {
    const approverId = Number(req.user.user_id);
    const substituteId = Number(req.body?.substitute_id ?? req.body?.substituteId);
    const validFrom = req.body?.valid_from ?? req.body?.validFrom;
    const validTo = req.body?.valid_to ?? req.body?.validTo;
    const row = await approvalSubstituteService.createSubstitute(
      approverId,
      substituteId,
      validFrom,
      validTo,
    );
    return res.status(201).json(row);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error("createApprovalSubstitute:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /api/approval-substitutes/:id
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function deleteApprovalSubstitute(req, res) {
  try {
    const approverId = Number(req.user.user_id);
    const id = Number(req.params.id);
    const result = await approvalSubstituteService.deleteSubstitute(id, approverId);
    return res.status(200).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error("deleteApprovalSubstitute:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default {
  listApprovalSubstitutes,
  createApprovalSubstitute,
  deleteApprovalSubstitute,
};
