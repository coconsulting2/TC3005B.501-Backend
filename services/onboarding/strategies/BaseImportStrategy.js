/**
 * @file services/onboarding/strategies/BaseImportStrategy.js
 * @description Interfaz base del patrón Strategy para parseo de archivos de onboarding.
 *
 * Cada estrategia concreta recibe el Buffer del archivo y devuelve un array de
 * ImportUserDTO normalizado. La validación de negocio se hace en una capa superior.
 *
 * Contrato:
 *   parse(buffer: Buffer, options?: object)
 *     → Promise<{ rows: ImportUserDTO[], embeddedRoleMappings: Record<string, string> }>
 *   get mimeTypes(): string[]   — tipos MIME que acepta esta estrategia.
 *   get label(): string         — nombre legible para logs/errores.
 *
 * @typedef {object} ImportUserDTO
 * @property {string}  userName     - identificador único de usuario (login)
 * @property {string}  email
 * @property {string}  [password]   - contraseña en texto plano del archivo (opcional; en `apply` se descarta y se exige passwordGlobal/overrides)
 * @property {string}  roleName     - nombre del rol o etiqueta externa a mapear
 * @property {string}  [department] - nombre de departamento (opcional)
 * @property {string}  [firstName]
 * @property {string}  [lastName]
 * @property {string}  [noEmpleado]        - clave empleado externa (SAP/RH)
 * @property {string}  [managerNoEmpleado] - jefe inmediato (adjacency list)
 * @property {string}  [sapCeco]
 * @property {string}  [sapProveedor]
 * @property {"A"|"I"|string} [sapStatus]
 * @property {number}  [_row]       - número de fila en el archivo origen (1-indexed)
 */
export class BaseImportStrategy {
  /** @returns {string[]} */
  get mimeTypes() {
    throw new Error(`${this.constructor.name}: mimeTypes no implementado`);
  }

  /** @returns {string} */
  get label() {
    return this.constructor.name;
  }

  /**
   * @param {Buffer} _buffer
   * @param {object} [_options]
   * @returns {Promise<{ rows: import('./BaseImportStrategy.js').ImportUserDTO[], embeddedRoleMappings: Record<string, string> }>}
   */

  /**
   *
   * @param _buffer
   * @param _options
   */
  async parse(_buffer, _options = {}) {
    throw new Error(`${this.constructor.name}: parse() no implementado`);
  }
}
