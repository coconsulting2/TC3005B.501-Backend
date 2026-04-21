/**
 * @module accountingCatalogs
 * @description Catalogos contables cerrados que no viven en la BD (son propiedad del ERP del cliente).
 * Mapea los codigos que aparecen en el ejemplo "Polizas contables gastos de Viaje.xlsx".
 *
 * Si el cliente migra estos catalogos a tablas reales, reemplazar los objetos por lecturas al modelo.
 */

/**
 * Sociedad / Company Code (COMP_CODE).
 * Formato C(4). Default unica sociedad: Ditta Servicios.
 */
export const SOCIEDAD_DEFAULT = "1000";

export const SOCIEDADES = {
    "1000": { descripcion: "Ditta Servicios", monedaLocal: "MXN" },
    "2000": { descripcion: "Importadora X", monedaLocal: "MXN" },
};

/**
 * Cuentas contables (GL_ACCOUNT).
 */
export const GL_ACCOUNTS = {
    ANTICIPO: "1000",
    CUENTA_POR_PAGAR_EMPLEADO: "1001",
    GASTO_DE_VIAJE: "1002",
    IVA_ACREDITABLE: "1003",
};

export const GL_ACCOUNT_DESCRIPTIONS = {
    "1000": "Anticipo",
    "1001": "Cuenta x pagar Empleado",
    "1002": "Gasto de Viaje",
    "1003": "Iva Acreditable",
};

/**
 * Clase de documento (DOC_TYPE).
 */
export const DOC_TYPES = {
    ANTICIPO_VIAJE: "AV",
    GASTO_VIAJE: "GV",
};

/**
 * Indicador debe/haber (SHKZG).
 */
export const SHKZG = {
    DEBE: "S",
    HABER: "H",
};

/**
 * Deriva un numero de proveedor de 11 digitos desde el userId.
 * Formato visto en el ejemplo: "20000000012" para Emp005 (userId=5 -> 20000000000 + 5).
 * NOTA: si el cliente aporta una tabla de proveedores real, reemplazar por lectura.
 *
 * @param {number} userId
 * @returns {string} Cadena de 11 digitos.
 */
export const proveedorFromUserId = (userId) => {
    const base = 20000000000n + BigInt(Number(userId));
    return base.toString().padStart(11, "0").slice(-11);
};

/**
 * Formatea una fecha como "DD/MM/YYYY" (formato SAP habitual en las polizas del Excel).
 * @param {Date} d
 * @returns {string}
 */
export const formatPstngDate = (d) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
};
