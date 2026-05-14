/**
 * @file services/onboarding/roleAliasResolver.js
 * @description Mapea alias legibles (JSON/CSV: profile, cxp, admin…) al nombre de rol
 * canónico definido en la organización.
 */

/** Claves normalizadas (minúsculas, sin acentos, espacios → _) → nombre de rol esperado en BD */
const ROLE_ALIAS_ENTRIES = [
  ["solicitante", "Solicitante"],
  ["applicant", "Solicitante"],

  ["n1", "N1"],
  ["n2", "N2"],

  ["cxp", "Cuentas por pagar"],
  ["cpp", "Cuentas por pagar"],
  ["cuentas_por_pagar", "Cuentas por pagar"],
  ["cuentasporpagar", "Cuentas por pagar"],

  ["agencia", "Agencia de viajes"],
  ["agencia_de_viajes", "Agencia de viajes"],

  ["admin", "Administrador"],
  ["admin_org", "Administrador"],
  ["org_admin", "Administrador"],
  ["administrador", "Administrador"],
  ["administrador_org", "Administrador"],

  ["observador", "Observador"],

  ["admin_ditta", "Admin Ditta"],
  ["superadmin", "Admin Ditta"],
];

const ROLE_ALIASES = new Map(ROLE_ALIAS_ENTRIES);

/**
 *
 * @param s
 */
function normalizeKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "_");
}

/**
 * @param {string} raw - roleName o alias (p. ej. profile: "cxp")
 * @param {string[]} validRoleNames - roleName existentes en la org
 * @returns {string} nombre canónico si se resuelve; si no, el texto original recortado
 */
export function resolveCanonicalRoleName(raw, validRoleNames) {
  const t = String(raw || "").trim();
  if (!t) return "";

  const exact = validRoleNames.find((n) => n.toLowerCase() === t.toLowerCase());
  if (exact) return exact;

  const nk = normalizeKey(t);
  const targetName = ROLE_ALIASES.get(nk);
  if (targetName) {
    const match = validRoleNames.find((n) => n.toLowerCase() === targetName.toLowerCase());
    if (match) return match;
  }

  return t;
}
