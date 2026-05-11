/**
 * @file services/onboarding/onboardingImportValidationService.js
 * @description Validación de los DTOs normalizados antes de persistirlos.
 *
 * No hace queries a la BD: solo valida el formato/reglas de negocio en memoria.
 * La detección de duplicados contra la BD se hace en onboardingImportService.
 *
 * @typedef {import('./strategies/BaseImportStrategy.js').ImportUserDTO} ImportUserDTO
 * @typedef {{ row: number, field: string, message: string }} ValidationError
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9._-]{3,64}$/;
// Mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

/**
 * @param {string} s
 * @returns {boolean}
 */
export function isValidImportPassword(s) {
  return typeof s === "string" && PASSWORD_RE.test(s);
}

/**
 * Valida un array de ImportUserDTO.
 *
 * @param {ImportUserDTO[]} rows
 * @param {string[]} validRoleNames  - roles existentes en la org destino.
 * @returns {{ valid: ImportUserDTO[], errors: ValidationError[] }}
 */
export function validateImportRows(rows, validRoleNames) {
  const validRoleSet = new Set(validRoleNames.map((r) => r.toLowerCase()));
  const errors = [];
  const valid = [];
  const seenUsernames = new Set();
  const seenEmails = new Set();

  rows.forEach((row, i) => {
    const rowNum = row._row ?? i + 1;
    const rowErrors = [];

    // userName
    if (!row.userName) {
      rowErrors.push({ row: rowNum, field: "userName", message: "Campo requerido." });
    } else if (!USERNAME_RE.test(row.userName)) {
      rowErrors.push({
        row: rowNum,
        field: "userName",
        message: "Solo letras minúsculas, números, puntos, guiones o guiones bajos (3-64 chars).",
      });
    } else if (seenUsernames.has(row.userName)) {
      rowErrors.push({ row: rowNum, field: "userName", message: "Duplicado en el archivo." });
    } else {
      seenUsernames.add(row.userName);
    }

    // email
    if (!row.email) {
      rowErrors.push({ row: rowNum, field: "email", message: "Campo requerido." });
    } else if (!EMAIL_RE.test(row.email)) {
      rowErrors.push({ row: rowNum, field: "email", message: "Email inválido." });
    } else if (seenEmails.has(row.email)) {
      rowErrors.push({ row: rowNum, field: "email", message: "Duplicado en el archivo." });
    } else {
      seenEmails.add(row.email);
    }

    // password
    if (!row.password) {
      rowErrors.push({ row: rowNum, field: "password", message: "Campo requerido." });
    } else if (!PASSWORD_RE.test(row.password)) {
      rowErrors.push({
        row: rowNum,
        field: "password",
        message: "Mínimo 8 caracteres, una mayúscula, una minúscula y un número.",
      });
    }

    // Rol: ya resuelto contra la org (mappedRoleName) o etiqueta externa pendiente (externalRoleLabel)
    if (!row.mappedRoleName && !row.externalRoleLabel) {
      rowErrors.push({
        row: rowNum,
        field: "roleName",
        message: "Campo requerido (rol, perfil o etiqueta del archivo).",
      });
    } else if (row.mappedRoleName && !validRoleSet.has(row.mappedRoleName.toLowerCase())) {
      rowErrors.push({
        row: rowNum,
        field: "roleName",
        message: `Rol interno inconsistente: "${row.mappedRoleName}".`,
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      valid.push(row);
    }
  });

  return { valid, errors };
}
