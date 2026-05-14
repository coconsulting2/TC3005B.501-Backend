/**
 * @module integrationResolver
 * @description Resuelve la configuración efectiva de una integración (SMTP, Wise, SAT,
 * Banxico, VAPID) para una org. Si la org tiene override en `organization_integrations`,
 * lo devuelve; si no, fallback a env vars (default Ditta-managed).
 *
 * El config en BD viaja encriptado con AES_SECRET_KEY usando el mismo helper que
 * el resto de PII (middleware/decryption.js). Aquí solo se descifra al leer.
 *
 * Caché: LRU in-memory con TTL 60s para evitar query por request. Invalidar
 * llamando `invalidateIntegrationCache(organizationId, provider)` después de update.
 */
import prisma from "../database/config/prisma.js";
import { withRls } from "../database/config/rlsConnection.js";
import { decrypt } from "../middleware/decryption.js";

const TTL_MS = 60_000;
const cache = new Map(); // key: `${organizationId}:${provider}` → { value, expiresAt }

/**
 * @param {bigint|number|string} organizationId
 * @param {'SMTP'|'WISE'|'SAT'|'BANXICO'|'VAPID'} provider
 * @returns {Promise<object>} Config descifrada (objeto JS).
 */
export async function resolveIntegration(organizationId, provider) {
  const key = `${String(organizationId)}:${provider}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const orgIdBig = BigInt(organizationId);
  // Bypass para leer la fila aunque el RLS context no esté seteado correctamente
  // (este resolver corre desde jobs internos, schedulers, etc.).
  const row = await withRls(orgIdBig, { bypass: true }, () =>
    prisma.organizationIntegration.findUnique({
      where: { organizationId_provider: { organizationId: orgIdBig, provider } },
    })
  );

  let value;
  if (row && row.active) {
    try {
      const decryptedJson = decrypt(row.config);
      value = JSON.parse(decryptedJson);
    } catch (err) {
      console.error(`integrationResolver: failed to decrypt ${provider} for org ${organizationId}: ${err.message}`);
      value = getFallbackConfig(provider);
    }
  } else {
    value = getFallbackConfig(provider);
  }

  cache.set(key, { value, expiresAt: now + TTL_MS });
  return value;
}

/**
 *
 * @param organizationId
 * @param provider
 */
export function invalidateIntegrationCache(organizationId, provider) {
  cache.delete(`${String(organizationId)}:${provider}`);
}

/**
 * Fallback global desde env vars. Documento de referencia: .env.example.
 * @param provider
 */
function getFallbackConfig(provider) {
  switch (provider) {
    case "SMTP":
      return {
        user: process.env.MAIL_USER || null,
        password: process.env.MAIL_PASSWORD || null,
      };
    case "WISE":
      return {
        clientId: process.env.WISE_CLIENT_ID || null,
        clientSecret: process.env.WISE_CLIENT_SECRET || null,
      };
    case "SAT":
      return {
        wsdlUrl: process.env.SAT_WSDL_URL || null,
        timeoutMs: Number(process.env.SAT_REQUEST_TIMEOUT_MS) || 30000,
      };
    case "BANXICO":
      return {
        apiKey: process.env.BANXICO_API_KEY || null,
        apiUrl: process.env.BMX_API_URL || null,
      };
    case "VAPID":
      return {
        publicKey: process.env.VAPID_PUBLIC_KEY || null,
        privateKey: process.env.VAPID_PRIVATE_KEY || null,
        mailto: process.env.VAPID_MAILTO || null,
      };
    default:
      return {};
  }
}
