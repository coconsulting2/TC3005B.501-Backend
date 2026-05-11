/**
 * @file services/onboarding/strategies/CsvImportStrategy.js
 * @description Strategy para importar usuarios desde CSV.
 *
 * Columnas esperadas (header en primera fila, case-insensitive, separador coma o punto y coma):
 *   userName, email, password, roleName (o profile/perfil), department, firstName, lastName
 *
 * Ejemplo:
 *   userName,email,password,roleName,department
 *   pedro.ramos,pedro@cliente.mx,Temp123!,N1,Operaciones
 *
 * No depende de librerías externas: parser manual simple y robusto.
 */
import { BaseImportStrategy } from "./BaseImportStrategy.js";

export class CsvImportStrategy extends BaseImportStrategy {
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
    const text = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);

    if (lines.length < 2) {
      throw new Error("El CSV debe tener al menos una fila de encabezado y una de datos.");
    }

    const sep = lines[0].includes(";") ? ";" : ",";
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());

    const required = ["username", "email", "password", "rolename"];
    const aliases = {
      username:   ["username", "username", "user_name"],
      email:      ["email"],
      password:   ["password", "pass"],
      rolename:   ["rolename", "role_name", "role", "profile", "perfil"],
      department: ["department", "dept"],
      firstname:  ["firstname", "first_name"],
      lastname:   ["lastname", "last_name"],
    };

    // Construye mapa canonico → índice en el header del CSV
    const colIndex = {};
    for (const [canonical, variants] of Object.entries(aliases)) {
      for (const v of variants) {
        const idx = headers.indexOf(v);
        if (idx !== -1) {
          colIndex[canonical] = idx;
          break;
        }
      }
    }

    for (const req of required) {
      if (colIndex[req] === undefined) {
        const alias = aliases[req].join(" / ");
        throw new Error(`Columna requerida no encontrada en el CSV: "${alias}".`);
      }
    }

    const get = (row, key) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "").trim() : "");

    const rows = lines.slice(1).map((line, i) => {
      const cols = this.#splitCsvLine(line, sep);
      return {
        userName:   get(cols, "username"),
        email:      get(cols, "email").toLowerCase(),
        password:   get(cols, "password"),
        roleName:   get(cols, "rolename"),
        department: get(cols, "department") || undefined,
        firstName:  get(cols, "firstname")  || undefined,
        lastName:   get(cols, "lastname")   || undefined,
        _row:       i + 2, // número de fila en el archivo (1-indexed, 1 = header)
      };
    });

    return { rows, embeddedRoleMappings: {} };
  }

  /**
   * Divide una línea CSV respetando comillas dobles.
   * @param {string} line
   * @param {string} sep
   * @returns {string[]}
   */
  #splitCsvLine(line, sep) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === sep && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }
}
