/**
 * @file services/onboarding/importRoleResolution.js
 * @description Resuelve el rol destino mezclando: alias internos, mapa embebido en el JSON
 *   y (en apply) el mapa enviado desde el front para etiquetas de otras empresas.
 */
import { resolveCanonicalRoleName } from "./roleAliasResolver.js";

/**
 * @param {string} rawRole - Texto del archivo (ej. "Approver", "cxp")
 * @param {string[]} validRoleNames - Roles existentes en la org
 * @param {Record<string, string>} [fileMappings] - roleMappings del JSON raíz (opcional)
 * @returns {{ mappedRoleName: string | null, externalRoleLabel: string | null }}
 */
export function resolveImportRole(rawRole, validRoleNames, fileMappings = {}) {
  const raw = String(rawRole ?? "").trim();
  if (!raw) return { mappedRoleName: null, externalRoleLabel: null };

  const lowerValid = new Map(validRoleNames.map((n) => [n.toLowerCase(), n]));

  let resolved = resolveCanonicalRoleName(raw, validRoleNames);
  let canonical = lowerValid.get(resolved.toLowerCase());
  if (canonical) return { mappedRoleName: canonical, externalRoleLabel: null };

  let targetFromFile = null;
  for (const [key, val] of Object.entries(fileMappings)) {
    if (String(key).trim().toLowerCase() === raw.toLowerCase()) {
      targetFromFile = String(val ?? "").trim();
      break;
    }
  }

  if (targetFromFile) {
    resolved = resolveCanonicalRoleName(targetFromFile, validRoleNames);
    canonical = lowerValid.get(resolved.toLowerCase());
    if (canonical) return { mappedRoleName: canonical, externalRoleLabel: null };

    canonical = lowerValid.get(targetFromFile.toLowerCase());
    if (canonical) return { mappedRoleName: canonical, externalRoleLabel: null };
  }

  return { mappedRoleName: null, externalRoleLabel: raw };
}

/**
 * Normaliza el nombre de rol elegido en UI contra el catálogo de la org.
 *
 * @param {string} pickedRoleName - Rol elegido en CocoConsulting (nombre en catálogo)
 * @param {string[]} validRoleNames
 * @returns {string | null} Nombre canónico en la org o null
 */
export function resolveManualRoleMapping(pickedRoleName, validRoleNames) {
  const raw = String(pickedRoleName ?? "").trim();
  if (!raw) return null;

  const lowerValid = new Map(validRoleNames.map((n) => [n.toLowerCase(), n]));

  const resolved = resolveCanonicalRoleName(raw, validRoleNames);
  let canonical = lowerValid.get(resolved.toLowerCase());
  if (canonical) return canonical;

  canonical = lowerValid.get(raw.toLowerCase());
  return canonical ?? null;
}
