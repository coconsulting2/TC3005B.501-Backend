/**
 * @file types/poliza.js
 * @description Contratos JSDoc alineados con CocoAPI_polizas_spec.md (backend JS).
 * Ver también servicios `accountingExportService` y `polizaCatalogService`.
 */

/**
 * @typedef {"AV"|"GV"} ClaseDocumento
 */

/**
 * @typedef {Object} PolizaHeader
 * @property {string} ID_VIAJE
 * @property {ClaseDocumento} DOC_TYPE
 * @property {string} HEADER_TXT
 * @property {string} COMP_CODE
 * @property {string} PSTNG_DATE ISO YYYY-MM-DD
 * @property {string} CURRENCY
 * @property {number} EXCH_RATE
 */

/**
 * @typedef {"S"|"H"} Shkzg
 */

/**
 * @typedef {Object} PolizaLine
 * @property {number} ITEMNO_ACC
 * @property {Shkzg} SHKZG
 * @property {string} GL_ACCOUNT
 * @property {string} [COSTCENTER]
 * @property {string} [VENDOR_NO]
 * @property {string} ITEM_TEXT
 * @property {number} AMT_DOCCUR
 */

/**
 * @typedef {Object} Poliza
 * @property {PolizaHeader} header
 * @property {PolizaLine[]} detalle
 */

/**
 * @typedef {Object} AccountingPolizaListItem
 * @property {string} id
 * @property {number} requestId
 * @property {number} polizaIndex
 * @property {string} docType
 * @property {boolean} requestMarkedExported
 * @property {string} createdAt ISO
 */

export {};
