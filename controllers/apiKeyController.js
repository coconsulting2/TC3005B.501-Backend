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
 * @param {import("express").Request} req
 * @param {bigint|string|number} targetOrgId
 * @returns {boolean}
 */
function userMayManageOrg(req, targetOrgId) {
  const perms = req.user?.permissionSet;
  if (perms instanceof Set && perms.has("organization:list_all")) {
    return true;
  }
  const jwtOrg = req.user?.organization_id;
  if (jwtOrg == null) {
    return false;
  }
  return BigInt(jwtOrg) === BigInt(targetOrgId);
}

/**
 * @param {import("express").Request} req
 * @param {bigint|string|number} targetOrgId
 * @returns {{ ok: true } | { ok: false, status: number, message: string }}
 */
function assertOrgAccess(req, targetOrgId) {
  if (!userMayManageOrg(req, targetOrgId)) {
    return { ok: false, status: 403, message: "Cannot manage API keys for this organization" };
  }
  return { ok: true };
}

/**
 * POST /api/keys/generate
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {Promise<void>}
 */
export const generateApiKey = async (req, res) => {
  try {
    const { org_id: orgId, name, scope, expires_at: expiresAt } = req.body;
    const access = assertOrgAccess(req, orgId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.message });
    }
    const createdBy = req.user.user_id;
    const { record, plainKey } = await apiKeyService.generateApiKeyForOrg({
      orgId,
      name,
      scope,
      expiresAt,
      createdBy,
    });
    res.status(201).json(
      jsonSafe({
        id: record.id,
        org_id: record.organizationId,
        name: record.name,
        key: plainKey,
        scope: record.scope,
        expires_at: record.expiresAt,
        active: true,
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
    const access = assertOrgAccess(req, existing.organizationId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.message });
    }
    const row = await apiKeyService.revokeApiKey(id);
    res.status(200).json(jsonSafe({
      id: row.id,
      org_id: row.organizationId,
      name: row.name,
      active: false,
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
    const access = assertOrgAccess(req, orgId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.message });
    }
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
    const access = assertOrgAccess(req, key.organizationId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.message });
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
