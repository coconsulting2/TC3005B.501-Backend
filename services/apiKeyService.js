/**
 * @module apiKeyService
 * @description Lógica de negocio para claves API por organización: generación
 * (secreto devuelto una sola vez), revocación, listados, normalización del
 * scope JSON y comprobaciones de scope para el middleware.
 *
 * Nota de diseño sobre el hash:
 * Las API keys son tokens opacos de 256 bits generados con CSPRNG
 * (`crypto.randomBytes(32)`), no contraseñas humanas. Aun así usamos un KDF
 * fuerte reconocido por CodeQL: **scrypt** con un *pepper* del servidor
 * (`API_KEY_HASH_PEPPER`, fallback `JWT_SECRET`) actuando como salt fijo.
 * El pepper como salt mantiene el hash determinista — necesario para
 * resolver la clave por índice único en `key_hash` (lookup O(1)) — y al
 * mismo tiempo obliga al atacante a poseer BD y pepper para precomputar.
 * Usamos la versión asíncrona para no bloquear el event loop.
 */
import { scrypt as _scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import * as apiKeyModel from "../models/apiKeyModel.js";

const scryptAsync = promisify(_scrypt);

const KEY_PREFIX = "cck_";
const HASH_HEX_LEN = 64;

// 32 bytes → 64 hex chars (encaja en api_keys.key_hash VARCHAR(64)).
const SCRYPT_KEYLEN = 32;
// Parámetros estándar OWASP: ~50–80 ms por hash en hardware típico.
const SCRYPT_OPTIONS = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

/**
 * Devuelve el pepper. Falla rápido si no hay secreto adecuado.
 * En producción debe ser independiente de JWT_SECRET para segregar dominios.
 *
 * @returns {string}
 */
function getApiKeyHashPepper() {
  const pepper = process.env.API_KEY_HASH_PEPPER || process.env.JWT_SECRET;
  if (!pepper || typeof pepper !== "string" || pepper.length < 16) {
    throw new Error(
      "API_KEY_HASH_PEPPER (or JWT_SECRET fallback) must be set with >=16 chars to hash API keys",
    );
  }
  return pepper;
}

/**
 * Calcula scrypt(plainKey, pepper) y devuelve hex (lo único que se persiste).
 * Es determinista por diseño (mismo pepper ⇒ mismo hash) para permitir lookup
 * por índice único en `api_keys.key_hash`.
 *
 * @param {string} plainKey
 * @returns {Promise<string>} 64 chars hex en minúsculas
 */
export async function hashApiKey(plainKey) {
  const buf = await scryptAsync(plainKey, getApiKeyHashPepper(), SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return buf.toString("hex");
}

/**
 * Genera un secreto opaco con prefijo fijo (no es el hash almacenado).
 *
 * @returns {string}
 */
function generatePlainApiKey() {
  return `${KEY_PREFIX}${randomBytes(32).toString("hex")}`;
}

/**
 * Valida la forma del scope JSON: debe ser objeto con `permissions: string[]`.
 *
 * @param {unknown} scope
 * @returns {object}
 */
function normalizeScope(scope) {
  if (scope === null || typeof scope !== "object" || Array.isArray(scope)) {
    const err = new Error("scope must be a JSON object");
    err.status = 400;
    throw err;
  }
  if (!Object.prototype.hasOwnProperty.call(scope, "permissions")) {
    const err = new Error("scope must include a \"permissions\" string array");
    err.status = 400;
    throw err;
  }
  const { permissions } = scope;
  const validShape =
    Array.isArray(permissions) &&
    permissions.length > 0 &&
    permissions.every((p) => typeof p === "string" && p.length > 0);
  if (!validShape) {
    const err = new Error("scope.permissions must be a non-empty array of strings");
    err.status = 400;
    throw err;
  }
  return scope;
}

/**
 * Convierte un valor a Date y exige que esté en el futuro.
 *
 * @param {string|Date} expiresAt
 * @returns {Date}
 */
function parseExpiresAt(expiresAt) {
  const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(d.getTime())) {
    const err = new Error("expires_at must be a valid ISO date");
    err.status = 400;
    throw err;
  }
  if (d.getTime() <= Date.now()) {
    const err = new Error("expires_at must be in the future");
    err.status = 400;
    throw err;
  }
  return d;
}

/**
 * Crea una clave API para una organización. El campo `plainKey` del resultado
 * es el secreto en claro y solo existe en esta respuesta — nunca se persiste.
 *
 * @param {Object} input
 * @param {bigint|string|number} input.orgId
 * @param {object} input.scope - Objeto JSON con `permissions: string[]`
 * @param {string|Date} input.expiresAt - ISO string o Date en el futuro
 * @param {number} input.createdBy - user_id del admin
 * @returns {Promise<{ record: object, plainKey: string }>}
 */
export async function generateApiKeyForOrg({ orgId, scope, expiresAt, createdBy }) {
  const normalizedScope = normalizeScope(scope);
  const exp = parseExpiresAt(expiresAt);

  // Reintenta ante choques improbables del índice único sobre key_hash.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const plainKey = generatePlainApiKey();
    const keyHash = await hashApiKey(plainKey);
    if (keyHash.length !== HASH_HEX_LEN) {
      throw new Error("unexpected hash length");
    }
    try {
      const record = await apiKeyModel.createApiKey({
        orgId: BigInt(orgId),
        keyHash,
        scope: normalizedScope,
        expiresAt: exp,
        createdBy,
      });
      return { record, plainKey };
    } catch (e) {
      if (e && e.code === "P2002") {
        continue;
      }
      throw e;
    }
  }
  throw new Error("could not allocate unique API key hash");
}

/**
 * @param {number} id
 * @returns {Promise<object>}
 */
export const revokeApiKey = (id) => apiKeyModel.revokeApiKeyById(id);

/**
 * @param {bigint|string|number} orgId
 * @returns {Promise<object[]>}
 */
export const listKeysForOrg = (orgId) => apiKeyModel.listApiKeysByOrgId(orgId);

/**
 * Lista entradas de auditoría (paginadas por cursor descendente sobre id).
 *
 * @param {number} keyId
 * @param {{ limit?: number|string, cursor?: string }} [query]
 * @returns {Promise<object[]>}
 */
export async function listAuditLogs(keyId, query = {}) {
  const take = Math.min(Number(query.limit) || 50, 200);
  let cursor;
  if (query.cursor !== undefined && query.cursor !== null && String(query.cursor).length > 0) {
    try {
      cursor = BigInt(String(query.cursor));
    } catch {
      const err = new Error("invalid cursor");
      err.status = 400;
      throw err;
    }
  }
  return apiKeyModel.listLogsByKeyId(keyId, { take, cursor });
}

/**
 * @param {object} scope
 * @param {...string} permissionCodes
 * @returns {boolean} true si el scope incluye todos los permisos (AND).
 */
export function scopeHasAllPermissions(scope, ...permissionCodes) {
  const perms = scope && typeof scope === "object" && Array.isArray(scope.permissions)
    ? scope.permissions
    : [];
  const set = new Set(perms);
  return permissionCodes.every((c) => set.has(c));
}

/**
 * @param {object} scope
 * @param {...string} permissionCodes
 * @returns {boolean} true si el scope incluye al menos uno (OR).
 */
export function scopeHasAnyPermission(scope, ...permissionCodes) {
  const perms = scope && typeof scope === "object" && Array.isArray(scope.permissions)
    ? scope.permissions
    : [];
  const set = new Set(perms);
  return permissionCodes.some((c) => set.has(c));
}
