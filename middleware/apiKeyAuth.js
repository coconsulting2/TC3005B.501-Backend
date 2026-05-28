/**
 * @module apiKeyAuth
 * @description Autenticación por cabecera `X-API-Key` o `Authorization: Bearer`,
 * validación de expiración/revocación contra `api_keys` y registro de auditoría
 * automático en `api_key_logs` cuando termina la respuesta.
 */
import * as apiKeyService from "../services/apiKeyService.js";
import * as apiKeyModel from "../models/apiKeyModel.js";
import { withTenantContext } from "./tenantContext.js";
import {
  InvalidApiKeyError,
  InsufficientApiKeyScopeError,
} from "./authErrors.js";

/**
 * Extrae el secreto crudo de la petición sin validarlo.
 *
 * @param {import("express").Request} req
 * @returns {string|null}
 */
export const extractApiKeyFromRequest = (req) => {
  const fromHeader = req.headers["x-api-key"];
  if (typeof fromHeader === "string" && fromHeader.trim().length > 0) {
    return fromHeader.trim();
  }
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token.length > 0) {
      return token;
    }
  }
  return null;
};

/**
 * Resuelve la fila `api_keys` por hash. Rechaza claves desconocidas, revocadas o vencidas.
 *
 * @param {string} plainKey
 * @returns {Promise<import("@prisma/client").ApiKey>}
 * @throws {InvalidApiKeyError}
 */
export async function resolveActiveApiKey(plainKey) {
  if (!plainKey || typeof plainKey !== "string") {
    throw new InvalidApiKeyError();
  }
  const keyHash = await apiKeyService.hashApiKey(plainKey);
  const row = await apiKeyModel.findApiKeyByHash(keyHash);
  if (!row) {
    throw new InvalidApiKeyError();
  }
  if (row.revokedAt) {
    throw new InvalidApiKeyError();
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new InvalidApiKeyError();
  }
  return row;
}

/**
 * Establece tenant context + `req.tenant` a partir de la org de la API key.
 * Debe ejecutarse después de `authenticateApiKey`.
 *
 * @type {import("express").RequestHandler}
 */
export const apiKeyTenantContext = (req, res, next) => {
  const row = req.apiKey;
  if (!row) {
    return next();
  }
  const organizationId = BigInt(row.organizationId);
  const ctx = {
    organizationId,
    jwtOrgId: organizationId,
    userId: null,
    isRoot: false,
    bypassTenant: false,
  };
  req.tenant = ctx;
  return withTenantContext(ctx, () => next());
};

/**
 * Middleware: exige cabecera con API key válida y adjunta `req.apiKey`.
 *
 * @type {import("express").RequestHandler}
 */
export const authenticateApiKey = async (req, res, next) => {
  try {
    const plain = extractApiKeyFromRequest(req);
    if (!plain) {
      throw new InvalidApiKeyError();
    }
    const row = await resolveActiveApiKey(plain);
    req.apiKey = row;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Registra una fila en `api_key_logs` cuando la respuesta termina, con el
 * código HTTP final. Solo actúa si `req.apiKey` está definido (debe usarse
 * después de `authenticateApiKey`). Falla en silencio para no afectar la
 * respuesta del cliente.
 *
 * @type {import("express").RequestHandler}
 */
export const apiKeyAuditLog = (req, res, next) => {
  const row = req.apiKey;
  if (!row) {
    return next();
  }
  const pathOnly = (req.originalUrl || req.url || "").split("?")[0];
  const endpoint = `${req.method} ${pathOnly}`;
  res.on("finish", () => {
    // Auditoría en BD (api_key_logs). No loguear keyId/orgId en texto claro (CodeQL js/clear-text-logging).
    void apiKeyModel
      .createApiKeyLog({
        keyId: row.id,
        endpoint,
        responseCode: res.statusCode,
      })
      .catch((err) => {
        console.error("apiKeyAuditLog insert failed:", err);
      });
  });
  next();
};

/**
 * Factory: exige que el scope incluya todos los permisos listados (AND).
 *
 * @param {...string} permissionCodes
 * @returns {import("express").RequestHandler}
 */
export const requireApiKeyPermission = (...permissionCodes) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      return next(new InvalidApiKeyError());
    }
    if (!apiKeyService.scopeHasAllPermissions(req.apiKey.scope, ...permissionCodes)) {
      return next(new InsufficientApiKeyScopeError());
    }
    next();
  };
};

/**
 * Factory: exige al menos uno de los permisos listados (OR).
 *
 * @param {...string} permissionCodes
 * @returns {import("express").RequestHandler}
 */
export const requireAnyApiKeyPermission = (...permissionCodes) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      return next(new InvalidApiKeyError());
    }
    if (!apiKeyService.scopeHasAnyPermission(req.apiKey.scope, ...permissionCodes)) {
      return next(new InsufficientApiKeyScopeError());
    }
    next();
  };
};
