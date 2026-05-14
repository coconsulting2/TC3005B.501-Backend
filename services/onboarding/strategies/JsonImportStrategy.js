/**
 * @file services/onboarding/strategies/JsonImportStrategy.js
 * @description Strategy para importar usuarios desde JSON.
 *
 * Formato esperado (array de objetos):
 * [
 *   {
 *     "userName":   "ana.lopez",
 *     "email":      "ana.lopez@cliente.com",
 *     "password":   "Temporal123!",
 *     "roleName":   "Solicitante",
 *     "department": "Finanzas",
 *     "firstName":  "Ana",
 *     "lastName":   "López"
 *   }
 * ]
 *
 * Wrapper recomendado para JSON de otra empresa:
 * {
 *   "roleMappings": {
 *     "Approver": "Solicitante",
 *     "Finance Lead": "Cuentas por pagar"
 *   },
 *   "users": [ ... ]
 * }
 *
 * También acepta array directo (sin roleMappings en raíz).
 * @typedef {{ nombre: string, rfc?: string|null, razonSocial?: string|null, timezone?: string, baseCurrency?: string }} OrganizationCreateSpec
 */
import { BaseImportStrategy } from "./BaseImportStrategy.js";

/**
 * @param {object|null} rawRoot - Objeto raíz del JSON (no un array suelto)
 * @returns {Record<string, string>}
 */
function extractEmbeddedMappings(rawRoot) {
  if (!rawRoot || typeof rawRoot !== "object" || Array.isArray(rawRoot)) return {};
  const rm = rawRoot.roleMappings;
  if (!rm || typeof rm !== "object" || Array.isArray(rm)) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(rm)) {
    if (typeof k === "string" && typeof v === "string" && k.trim() && v.trim()) {
      out[k.trim()] = v.trim();
    }
  }
  return out;
}

/**
 * Extrae datos de organización nueva desde la raíz del JSON (import onboarding).
 * @param {object|null} rawRoot
 * @returns {OrganizationCreateSpec|null}
 */
export function extractOrganizationSpecFromJsonRoot(rawRoot) {
  if (!rawRoot || typeof rawRoot !== "object" || Array.isArray(rawRoot)) return null;
  const o = rawRoot.organization;
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const nombre = String(o.nombre ?? "").trim();
  if (!nombre) return null;
  const rfc = o.rfc !== undefined && o.rfc !== null && String(o.rfc).trim() ? String(o.rfc).trim() : null;
  const razonSocial =
    o.razonSocial !== undefined && o.razonSocial !== null && String(o.razonSocial).trim()
      ? String(o.razonSocial).trim()
      : null;
  const timezone =
    typeof o.timezone === "string" && o.timezone.trim()
      ? o.timezone.trim()
      : "America/Mexico_City";
  const baseCurrency =
    typeof o.baseCurrency === "string" && o.baseCurrency.trim()
      ? o.baseCurrency.trim()
      : "MXN";
  return { nombre, rfc, razonSocial, timezone, baseCurrency };
}

/**
 * Estrategia de importación JSON (usuarios + campos opcionales layout SAP).
 */
export class JsonImportStrategy extends BaseImportStrategy {
  /** @returns {string[]} MIME types aceptados */
  get mimeTypes() {
    return ["application/json", "text/json"];
  }

  /** @returns {string} Etiqueta para logs */
  get label() {
    return "JSON";
  }

  /**
   * @param {Buffer} buffer
   * @returns {Promise<{ rows: import('./BaseImportStrategy.js').ImportUserDTO[], embeddedRoleMappings: Record<string, string>, organizationSpec: OrganizationCreateSpec|null }>}
   */
  async parse(buffer) {
    let raw;
    try {
      raw = JSON.parse(buffer.toString("utf-8"));
    } catch {
      throw new Error("El archivo JSON no es válido. Verifica la sintaxis.");
    }

    const embeddedRoleMappings = Array.isArray(raw) ? {} : extractEmbeddedMappings(raw);
    const organizationSpec = Array.isArray(raw) ? null : extractOrganizationSpecFromJsonRoot(raw);

    const rows = Array.isArray(raw) ? raw : raw?.users;
    if (!Array.isArray(rows)) {
      throw new Error(
        "El JSON debe ser un array de usuarios o un objeto con propiedad \"users\"."
      );
    }
    if (rows.length === 0) {
      throw new Error("El archivo JSON está vacío (ningún usuario encontrado).");
    }

    return {
      rows: rows.map((r, i) => this.#normalizeRow(r, i)),
      embeddedRoleMappings,
      organizationSpec,
    };
  }

  /**
   * @param {Record<string,unknown>} row
   * @param {...string} keys
   * @returns {string|undefined}
   */
  #pick(row, ...keys) {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return String(row[k]).trim();
    }
    return undefined;
  }

  /**
   * @param {Record<string,unknown>} row
   * @param {number} index
   * @returns {import('./BaseImportStrategy.js').ImportUserDTO}
   */
  #normalizeRow(row, index) {
    if (typeof row !== "object" || row === null) {
      throw new Error(`Fila ${index + 1}: se esperaba un objeto, se recibió ${typeof row}.`);
    }
    const dto = {
      userName: String(row.userName ?? row.username ?? "").trim(),
      email: String(row.email ?? "").trim().toLowerCase(),
      password: String(row.password ?? row.pass ?? "").trim(),
      roleName: String(row.roleName ?? row.role ?? row.profile ?? "").trim(),
      department: String(row.department ?? row.dept ?? "").trim() || undefined,
      firstName: String(row.firstName ?? row.first_name ?? "").trim() || undefined,
      lastName: String(row.lastName ?? row.last_name ?? "").trim() || undefined,
    };
    const noEmpleado = this.#pick(row, "noEmpleado", "no_empleado", "employee_id", "emp_id");
    const sapProveedor = this.#pick(row, "sapProveedor", "proveedor", "vendor_no", "vendor_number");
    const sapCeco = this.#pick(row, "sapCeco", "ceco", "cost_center");
    const managerNoEmpleado = this.#pick(row, "managerNoEmpleado", "jefe_inmediato", "jefeInmediato", "manager_id");
    const managerUserName = this.#pick(row, "managerUserName", "manager_username", "reports_to", "manager");
    const sapStatus = this.#pick(row, "sapStatus", "status");
    if (noEmpleado) dto.noEmpleado = noEmpleado;
    if (sapProveedor) dto.sapProveedor = sapProveedor;
    if (sapCeco) dto.sapCeco = sapCeco;
    if (managerNoEmpleado) dto.managerNoEmpleado = managerNoEmpleado;
    if (managerUserName) dto.managerUserName = managerUserName;
    if (sapStatus && (sapStatus === "A" || sapStatus === "I")) dto.sapStatus = sapStatus;
    return dto;
  }
}
