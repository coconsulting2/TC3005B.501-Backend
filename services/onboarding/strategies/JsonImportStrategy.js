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

export class JsonImportStrategy extends BaseImportStrategy {
  get mimeTypes() {
    return ["application/json", "text/json"];
  }

  get label() {
    return "JSON";
  }

  /**
   * @param {Buffer} buffer
   * @returns {Promise<{ rows: import('./BaseImportStrategy.js').ImportUserDTO[], embeddedRoleMappings: Record<string, string> }>}
   */
  async parse(buffer) {
    let raw;
    try {
      raw = JSON.parse(buffer.toString("utf-8"));
    } catch {
      throw new Error("El archivo JSON no es válido. Verifica la sintaxis.");
    }

    const embeddedRoleMappings = Array.isArray(raw) ? {} : extractEmbeddedMappings(raw);

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
    };
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
    return {
      userName:   String(row.userName   ?? row.username   ?? "").trim(),
      email:      String(row.email      ?? "").trim().toLowerCase(),
      password:   String(row.password   ?? row.pass       ?? "").trim(),
      roleName:   String(row.roleName   ?? row.role ?? row.profile ?? "").trim(),
      department: String(row.department ?? row.dept       ?? "").trim() || undefined,
      firstName:  String(row.firstName  ?? row.first_name ?? "").trim() || undefined,
      lastName:   String(row.lastName   ?? row.last_name  ?? "").trim() || undefined,
    };
  }
}
