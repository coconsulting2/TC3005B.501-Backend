/**
 * @module apiKeyModel
 * @description Acceso a datos para claves API por organización (`api_keys`)
 * y su auditoría (`api_key_logs`). Mantiene a Prisma fuera de los services.
 */
import prisma from "../database/config/prisma.js";

/**
 * @param {number} id - api_keys.id
 * @returns {Promise<import("@prisma/client").ApiKey|null>}
 */
export const findApiKeyById = (id) =>
  prisma.apiKey.findUnique({ where: { id } });

/**
 * @param {string} keyHash - SHA-256 hex (64 chars) del secreto
 * @returns {Promise<import("@prisma/client").ApiKey|null>}
 */
export const findApiKeyByHash = (keyHash) =>
  prisma.apiKey.findUnique({ where: { keyHash } });

/**
 * @param {Object} data - Campos Prisma para crear la fila
 * @returns {Promise<import("@prisma/client").ApiKey>}
 */
export const createApiKey = (data) =>
  prisma.apiKey.create({ data });

/**
 * Marca la clave como revocada (no la borra para preservar la auditoría histórica).
 *
 * @param {number} id
 * @returns {Promise<import("@prisma/client").ApiKey>}
 */
export const revokeApiKeyById = (id) =>
  prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

/**
 * @param {bigint|string|number} orgId
 * @returns {Promise<Array>} Filas sin `key_hash` (no se expone nunca tras la creación).
 */
export const listApiKeysByOrgId = (orgId) =>
  prisma.apiKey.findMany({
    where: { organizationId: BigInt(orgId) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      organizationId: true,
      name: true,
      scope: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      createdBy: true,
    },
  });

/**
 * @param {number} keyId
 * @param {{ take?: number, cursor?: bigint }} [opts]
 * @returns {Promise<Array>}
 */
export const listLogsByKeyId = (keyId, opts = {}) => {
  const { take = 50, cursor } = opts;
  return prisma.apiKeyLog.findMany({
    where: { keyId },
    orderBy: { timestamp: "desc" },
    take,
    ...(cursor !== undefined && cursor !== null
      ? {
          skip: 1,
          cursor: { id: cursor },
        }
      : {}),
  });
};

/**
 * @param {Object} data - { keyId, endpoint, responseCode }
 * @returns {Promise<import("@prisma/client").ApiKeyLog>}
 */
export const createApiKeyLog = (data) =>
  prisma.apiKeyLog.create({ data });
