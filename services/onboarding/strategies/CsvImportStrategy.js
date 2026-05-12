/**
 * @file services/onboarding/strategies/CsvImportStrategy.js
 * @description Strategy para importar usuarios desde CSV.
 *
 * Columnas esperadas (header en primera fila, case-insensitive, separador coma o punto y coma):
 *   userName, email, password (opcional), roleName (o profile/perfil), department, firstName, lastName
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
};

const REQUIRED_COLUMNS = ["username", "email", "rolename"];

export class CsvImportStrategy extends BaseImportStrategy {
  /** Tope defensivo de tamaño de buffer (5 MB). Evita DoS por archivos enormes. */
  static MAX_CSV_BYTES = 5 * 1024 * 1024;

  get mimeTypes() {
    return ["text/csv", "text/plain", "application/vnd.ms-excel"];
  }

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

    const rows = records.slice(1).map((cols, i) => ({
      userName:   get(cols, "username"),
      email:      get(cols, "email").toLowerCase(),
      password:   get(cols, "password") || undefined,
      roleName:   get(cols, "rolename"),
      department: get(cols, "department") || undefined,
      firstName:  get(cols, "firstname")  || undefined,
      lastName:   get(cols, "lastname")   || undefined,
      _row:       i + 2,
    }));

    return { rows, embeddedRoleMappings: {} };
  }
}
