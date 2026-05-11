/**
 * @file services/onboarding/strategies/BaseImportStrategy.js
 * @description Interfaz base del patrón Strategy para parseo de archivos de onboarding.
 *
 * Cada estrategia concreta recibe el Buffer del archivo y devuelve un array de
 * ImportUserDTO normalizado. La validación de negocio se hace en una capa superior.
 *
 * Contrato:
 *   parse(buffer: Buffer, options?: object) → Promise<ImportUserDTO[]>
 *   get mimeTypes(): string[]   — tipos MIME que acepta esta estrategia.
 *   get label(): string         — nombre legible para logs/errores.
 *
 * @typedef {object} ImportUserDTO
 * @property {string}  userName     - identificador único de usuario (login)
 * @property {string}  email
 * @property {string}  password     - contraseña en texto plano (se hashea en el servicio)
 * @property {string}  roleName     - nombre del rol a asignar dentro de la org
 * @property {string}  [department] - nombre de departamento (opcional)
 * @property {string}  [firstName]
 * @property {string}  [lastName]
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
   * @returns {Promise<import('./BaseImportStrategy.js').ImportUserDTO[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async parse(_buffer, _options = {}) {
    throw new Error(`${this.constructor.name}: parse() no implementado`);
  }
}
