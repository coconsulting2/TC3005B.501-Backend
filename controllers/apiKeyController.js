/**
 * @module apiKeyController
 * @description Handlers HTTP para el panel admin de API keys: generar, revocar,
 * listar por organización y consultar logs. JWT + permiso `api_key:manage` se
 * componen en las rutas (no aquí).
 */
import * as apiKeyService from "../services/apiKeyService.js";
import * as apiKeyModel from "../models/apiKeyModel.js";

/**
 * Convierte BigInt a string recursivamente para serialización JSON segura.
 * Express ya parchea Number-style BigInt en `app.js`, pero este helper
 * mantiene la forma de los objetos anidados sin tocar Date/Array.
 *
 * @param {unknown} v
 * @returns {unknown}
 */
const jsonSafe = (v) => {
  if (typeof v === "bigint") {
    return v.toString();
  }
  if (Array.isArray(v)) {
    return v.map(jsonSafe);
  }
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = jsonSafe(val);
    }
    return out;
  }
  return v;
};

/**
 * POST /api/keys/generate
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {Promise<void>} 201 con `key` (única vez), o 400 si la entrada es inválida.
 */
export const generateApiKey = async (req, res) => {
  try {
    const { org_id: orgId, scope, expires_at: expiresAt } = req.body;
    const createdBy = req.user.user_id;
    const { record, plainKey } = await apiKeyService.generateApiKeyForOrg({
      orgId,
      scope,
      expiresAt,
      createdBy,
    });
    res.status(201).json(
      jsonSafe({
        id: record.id,
        org_id: record.orgId,
        key: plainKey,
        scope: record.scope,
        expires_at: record.expiresAt,
        created_at: record.createdAt,
        created_by: record.createdBy,
      }),
    );
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error("generateApiKey error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /api/keys/:id/revoke
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {Promise<void>}
 */
export const revokeApiKeyById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await apiKeyModel.findApiKeyById(id);
    if (!existing) {
      return res.status(404).json({ error: "API key not found" });
    }
    const row = await apiKeyService.revokeApiKey(id);
    res.status(200).json(jsonSafe({
      id: row.id,
      org_id: row.orgId,
      revoked_at: row.revokedAt,
    }));
  } catch (err) {
    console.error("revokeApiKeyById error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/keys/org/:orgId
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {Promise<void>}
 */
export const listApiKeysByOrg = async (req, res) => {
  try {
    const { orgId } = req.params;
    const rows = await apiKeyService.listKeysForOrg(orgId);
    res.status(200).json(jsonSafe(rows));
  } catch (err) {
    console.error("listApiKeysByOrg error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/keys/:id/logs
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {Promise<void>}
 */
export const listApiKeyLogs = async (req, res) => {
  try {
    const keyId = Number(req.params.id);
    const key = await apiKeyModel.findApiKeyById(keyId);
    if (!key) {
      return res.status(404).json({ error: "API key not found" });
    }
    const rows = await apiKeyService.listAuditLogs(keyId, {
      limit: req.query.limit,
      cursor: req.query.cursor,
    });
    res.status(200).json(jsonSafe(rows));
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error("listApiKeyLogs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
