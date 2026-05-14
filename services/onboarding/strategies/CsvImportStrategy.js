/**
 * @file services/onboarding/strategies/CsvImportStrategy.js
 * @description Strategy para importar usuarios desde CSV.
 *
 * Columnas esperadas (header en primera fila, case-insensitive, separador coma o punto y coma):
 *   Modo estándar:
 *     userName, email, password (opcional), roleName (o profile/perfil), department, firstName, lastName
 *   Modo SAP (catálogo empleado):
 *     no_empleado, nombre, email, jefe_inmediato, proveedor, ceco, status
 *     (roleName es opcional; si no existe se usa "Solicitante")
 *
 * Ejemplo:
 *   userName,email,roleName,department
 *   pedro.ramos,pedro@cliente.mx,N1,Operaciones
 *
 * Usa `csv-parse/sync` para manejar correctamente comillas, escapes y celdas con saltos de línea.
 */
import { parse as parseCsvSync } from "csv-parse/sync";
import { BaseImportStrategy } from "./BaseImportStrategy.js";

/** Aliases por columna canónica (todos en minúsculas). */
const COLUMN_ALIASES = {
  username:   ["username", "user_name"],
  email:      ["email"],
  password:   ["password", "pass"],
  rolename:   ["rolename", "role_name", "role", "profile", "perfil"],
  department: ["department", "dept"],
  firstname:  ["firstname", "first_name"],
  lastname:   ["lastname", "last_name"],
  noempleado: ["no_empleado", "noempleado", "employee_id", "emp_id"],
  nombre:     ["nombre", "name", "full_name"],
  ceco:       ["ceco", "centro_costo", "cost_center"],
  proveedor:  ["proveedor", "vendor", "vendor_no", "vendor_number"],
  status:     ["status", "estatus"],
  jefeinmediato: ["jefe_inmediato", "jefeinmediato", "manager", "manager_id"],
};

const REQUIRED_COLUMNS = ["username", "email", "rolename"];

/**
 *
 */
export class CsvImportStrategy extends BaseImportStrategy {
  /** Tope defensivo de tamaño de buffer (5 MB). Evita DoS por archivos enormes. */
  static MAX_CSV_BYTES = 5 * 1024 * 1024;

  /**
   *
   */
  get mimeTypes() {
    return ["text/csv", "text/plain", "application/vnd.ms-excel"];
  }

  /**
   *
   */
  get label() {
    return "CSV";
  }

  /**
   * @param {Buffer} buffer
   * @returns {Promise<{ rows: import('./BaseImportStrategy.js').ImportUserDTO[], embeddedRoleMappings: Record<string, string> }>}
   */
  async parse(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error("Archivo CSV inválido.");
    }
    if (buffer.length > CsvImportStrategy.MAX_CSV_BYTES) {
      throw new Error("El archivo CSV excede el tamaño máximo permitido (5 MB).");
    }

    const text = buffer.toString("utf-8").replace(/^\uFEFF/, "");

    if (!text.trim()) {
      throw new Error("El CSV está vacío.");
    }

    // Detección simple de separador: priorizamos ';' si aparece en la primera línea.
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    const delimiter = firstLine.includes(";") ? ";" : ",";

    /** @type {string[][]} */
    let records;
    try {
      records = parseCsvSync(text, {
        delimiter,
        trim: true,
        skip_empty_lines: true,
        relax_column_count: true,
        bom: true,
      });
    } catch (e) {
      throw new Error(`No se pudo leer el CSV: ${e?.message ?? "formato inválido"}.`);
    }

    if (records.length < 2) {
      throw new Error("El CSV debe tener al menos una fila de encabezado y una de datos.");
    }

    const headers = records[0].map((h) => String(h ?? "").trim().toLowerCase());

    /** canonicalKey → índice en el header */
    const colIndex = {};
    for (const [canonical, variants] of Object.entries(COLUMN_ALIASES)) {
      for (const v of variants) {
        const idx = headers.indexOf(v);
        if (idx !== -1) {
          colIndex[canonical] = idx;
          break;
        }
      }
    }

    for (const req of REQUIRED_COLUMNS) {
      if (colIndex[req] === undefined) {
        const aliases = COLUMN_ALIASES[req].join(" / ");
        throw new Error(`Columna requerida no encontrada en el CSV: "${aliases}".`);
      }
    }

    const get = (cols, key) =>
      colIndex[key] !== undefined ? String(cols[colIndex[key]] ?? "").trim() : "";

    const hasStandardUserName = colIndex.username !== undefined;
    const hasSapNoEmpleado = colIndex.noempleado !== undefined;
    const hasSapNombre = colIndex.nombre !== undefined;

    /**
     * Heurística:
     * - si existe username -> formato estándar
     * - si no existe username pero sí no_empleado/nombre -> formato SAP
     */
    const isSapLike = !hasStandardUserName && (hasSapNoEmpleado || hasSapNombre);

    const toUserNameFromSap = (noEmpleado, fallbackName) => {
      const base = String(noEmpleado || fallbackName || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ".")
        .replace(/[^a-z0-9._-]/g, "");
      return base;
    };

    const splitName = (fullName) => {
      const t = String(fullName || "").trim();
      if (!t) return { firstName: "", lastName: "" };
      const parts = t.split(/\s+/);
      if (parts.length === 1) return { firstName: parts[0], lastName: "" };
      return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) || "" };
    };

    const rows = records.slice(1).map((cols, i) => {
      if (!isSapLike) {
        return {
          userName:   get(cols, "username"),
          email:      get(cols, "email").toLowerCase(),
          password:   get(cols, "password") || undefined,
          roleName:   get(cols, "rolename"),
          department: get(cols, "department") || undefined,
          firstName:  get(cols, "firstname")  || undefined,
          lastName:   get(cols, "lastname")   || undefined,
          _row:       i + 2,
        };
      }

      const noEmpleado = get(cols, "noempleado");
      const nombre = get(cols, "nombre");
      const roleName = get(cols, "rolename") || "Solicitante";
      const ceco = get(cols, "ceco");
      const proveedor = get(cols, "proveedor");
      const status = (get(cols, "status") || "A").toUpperCase();
      const userName = toUserNameFromSap(noEmpleado, nombre);
      const { firstName, lastName } = splitName(nombre);
      let email = get(cols, "email").toLowerCase();

      // SAP puede venir sin email; generamos uno sintético estable para permitir onboarding.
      if (!email) {
        const providerTag = proveedor ? String(proveedor).replace(/\D+/g, "") : "sap";
        email = `${userName}.${providerTag}@sap.local`;
      }

      return {
        userName,
        email,
        password: undefined,
        roleName,
        department: ceco || undefined,
        sapCeco: ceco || undefined,
        sapProveedor: proveedor || undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        noEmpleado: noEmpleado || undefined,
        managerNoEmpleado: get(cols, "jefeinmediato") || undefined,
        sapStatus: status,
        _row: i + 2,
      };
    });

    return { rows, embeddedRoleMappings: {}, organizationSpec: null };
  }
}
