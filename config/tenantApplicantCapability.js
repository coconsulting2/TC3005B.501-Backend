/**
 * Capacidad base de “solicitante” por tenant (CocoAPI_flujos_congruencia.md §7.5 / §7.15).
 * No es un rol: todo usuario activo del tenant debe poder usar el flujo mínimo de solicitudes
 * y comprobantes propios, además de los permisos que otorgue su rol o grants directos.
 *
 * Excepciones de producto (ajustar aquí sin tocar el motor de permisos):
 * - Usuario inactivo: no se une esta capacidad (ver `shouldMergeTenantApplicantCapability`).
 * - `EXCLUDED_ORGANIZATION_KINDS_FOR_APPLICANT_MERGE`: por defecto vacío; si producto
 *   decide que la org ROOT no debe tener flujo viajero implícito, añadir el literal `"ROOT"`.
 */

/** @type {ReadonlyArray<string>} valores de `Organization.kind` (Prisma) excluidos del merge */
export const EXCLUDED_ORGANIZATION_KINDS_FOR_APPLICANT_MERGE = Object.freeze([]);

/**
 * Códigos de permiso globales (catálogo `Permission`) que componen la capacidad solicitante.
 * Deben coincidir con el grupo `TravelRequestAuthor` en el bootstrap por org.
 */
export const TENANT_APPLICANT_CAPABILITY_CODES = Object.freeze([
  "travel_request:create",
  "travel_request:view_own",
  "travel_request:view_any",
  "travel_request:edit_own",
  "travel_request:submit",
  "travel_request:cancel",
  "receipt:upload",
  "receipt:delete_own",
  "receipt:view_sat",
  "expense:view",
  "expense:submit",
  "policy:read",
  "user:view_self",
]);

/**
 * @param {object} ctx
 * @param {boolean} ctx.userActive - Requerido para resolución por usuario
 * @param {string|undefined} ctx.organizationKind - `Organization.kind` de Prisma
 * @returns {boolean}
 */
export function shouldMergeTenantApplicantCapability({ userActive, organizationKind }) {
  if (!userActive) return false;
  if (organizationKind === undefined || organizationKind === null) return false;
  return !EXCLUDED_ORGANIZATION_KINDS_FOR_APPLICANT_MERGE.includes(organizationKind);
}
