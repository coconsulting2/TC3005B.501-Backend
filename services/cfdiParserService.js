/**
 * @module cfdiParserService
 * @description Parses SAT CFDI v3.3 and v4.0 XML files using fast-xml-parser.
 * Extracts RFC emisor, receptor, fecha, total, UUID and desglosed taxes.
 * Validates document structure before extraction.
 */
import { XMLParser } from "fast-xml-parser";

const SUPPORTED_VERSIONS = ["3.3", "4.0"];

/**
 * Ultimos 8 caracteres del Sello del emisor (parametro `fe` en expresion impresa SAT).
 * @param {string|null|undefined} sello - Valor de cfdi:Comprobante@Sello
 * @returns {string|null}
 */
export function selloUltimos8FromSello(sello) {
  if (!sello || typeof sello !== "string") {
    return null;
  }
  const t = sello.trim();
  if (t.length < 8) {
    return null;
  }
  return t.slice(-8);
}

/** Maps CFDI impuesto code to human-readable name */
const IMPUESTO_NOMBRES = {
  "001": "ISR",
  "002": "IVA",
  "003": "IEPS",
};

/**
 * Structured error for CFDI parsing failures.
 * @property {string} code - Machine-readable error code
 */
export class CfdiParseError extends Error {
  /**
   *
   * @param message
   * @param code
   */
  constructor(message, code) {
    super(message);
    this.name = "CfdiParseError";
    this.code = code;
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (tagName) => ["Traslado", "Retencion", "Concepto"].includes(tagName),
});

/**
 * @param {Record<string, unknown>} parsed
 * @returns {Object|null}
 */
function getComprobanteRoot(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  return parsed.Comprobante || parsed.comprobante || parsed["cfdi:Comprobante"] || null;
}

/**
 * Suma importes de traslado IVA (impuesto 002) en el nodo Impuestos del comprobante.
 * @param {Object|undefined} impuestos
 * @returns {number}
 */
function sumIvaTrasladosFromImpuestos(impuestos) {
  if (!impuestos?.Traslados?.Traslado) {
    return 0;
  }
  const raw = impuestos.Traslados.Traslado;
  const list = Array.isArray(raw) ? raw : [raw];
  let sum = 0;
  for (const t of list) {
    if (String(t["@_Impuesto"] ?? "") === "002") {
      const imp = parseFloat(t["@_Importe"]);
      if (!Number.isNaN(imp)) {
        sum += imp;
      }
    }
  }
  return sum;
}

/**
 * Parses a CFDI XML string and returns extracted fiscal data.
 *
 * @param {string} xmlString - Raw XML content of the CFDI
 * @returns {{
 *   version: string,
 *   rfcEmisor: string,
 *   rfcReceptor: string|null,
 *   fecha: Date,
 *   total: number,
 *   uuid: string,
 *   sello: string|null,
 *   selloUltimos8: string|null,
 *   taxes: {
 *     totalTrasladados: number|null,
 *     totalRetenidos: number|null,
 *     traslados: Array<{base: number, impuesto: string, impuestoNombre: string, tipoFactor: string, tasaOCuota: number, importe: number}>,
 *     retenciones: Array<{impuesto: string, impuestoNombre: string, importe: number}>
 *   }
 * }}
 * @throws {CfdiParseError} If the XML structure is invalid or required fields are missing
 */
export function parseCFDI(xmlString) {
  if (!xmlString || typeof xmlString !== "string" || !xmlString.trim()) {
    throw new CfdiParseError("El contenido XML está vacío", "EMPTY_XML");
  }

  let parsed;
  try {
    parsed = parser.parse(xmlString);
  } catch (err) {
    throw new CfdiParseError(`XML malformado: ${err.message}`, "INVALID_XML");
  }

  const comprobante = getComprobanteRoot(parsed);
  if (!comprobante) {
    throw new CfdiParseError(
      "Nodo cfdi:Comprobante no encontrado. Verifique que el XML sea un CFDI válido.",
      "MISSING_COMPROBANTE"
    );
  }

  const version = comprobante["@_Version"];
  if (!version) {
    throw new CfdiParseError(
      "Atributo Version no encontrado en cfdi:Comprobante",
      "MISSING_VERSION"
    );
  }
  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new CfdiParseError(
      `Versión CFDI '${version}' no soportada. Versiones válidas: ${SUPPORTED_VERSIONS.join(", ")}`,
      "UNSUPPORTED_VERSION"
    );
  }

  const emisor = comprobante.Emisor;
  if (!emisor) {
    throw new CfdiParseError(
      "Nodo cfdi:Emisor no encontrado",
      "MISSING_EMISOR"
    );
  }
  const rfcEmisor = emisor["@_Rfc"];
  if (!rfcEmisor) {
    throw new CfdiParseError(
      "Atributo Rfc no encontrado en cfdi:Emisor",
      "MISSING_RFC_EMISOR"
    );
  }

  const receptor = comprobante.Receptor;
  const rfcReceptor = receptor?.["@_Rfc"] ?? null;

  const fecha = comprobante["@_Fecha"];
  if (!fecha) {
    throw new CfdiParseError(
      "Atributo Fecha no encontrado en cfdi:Comprobante",
      "MISSING_FECHA"
    );
  }
  const fechaDate = new Date(fecha);
  if (isNaN(fechaDate.getTime())) {
    throw new CfdiParseError(
      `Fecha '${fecha}' no es una fecha ISO válida`,
      "INVALID_FECHA"
    );
  }

  const totalRaw = comprobante["@_Total"];
  if (totalRaw === undefined || totalRaw === null || totalRaw === "") {
    throw new CfdiParseError(
      "Atributo Total no encontrado en cfdi:Comprobante",
      "MISSING_TOTAL"
    );
  }
  const total = parseFloat(totalRaw);
  if (isNaN(total)) {
    throw new CfdiParseError(
      `Total '${totalRaw}' no es un número válido`,
      "INVALID_TOTAL"
    );
  }

  const complemento = comprobante.Complemento;
  if (!complemento) {
    throw new CfdiParseError(
      "Nodo cfdi:Complemento no encontrado. El CFDI no está timbrado.",
      "MISSING_COMPLEMENTO"
    );
  }

  const timbre = complemento.TimbreFiscalDigital;
  if (!timbre) {
    throw new CfdiParseError(
      "Nodo tfd:TimbreFiscalDigital no encontrado en cfdi:Complemento",
      "MISSING_TIMBRE"
    );
  }

  const uuid = timbre["@_UUID"];
  if (!uuid) {
    throw new CfdiParseError(
      "Atributo UUID no encontrado en tfd:TimbreFiscalDigital",
      "MISSING_UUID"
    );
  }

  const uuidNormalized = uuid.toUpperCase().trim();
  if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(uuidNormalized)) {
    throw new CfdiParseError(
      `UUID '${uuid}' no tiene formato UUID válido`,
      "INVALID_UUID_FORMAT"
    );
  }

  const taxes = extractTaxes(comprobante.Impuestos);

  const selloRaw = comprobante["@_Sello"] ?? null;
  const sello =
    selloRaw !== null && selloRaw !== undefined && selloRaw !== "" ? String(selloRaw).trim() : null;

  return {
    version,
    rfcEmisor: rfcEmisor.toUpperCase().trim(),
    rfcReceptor: rfcReceptor ? rfcReceptor.toUpperCase().trim() : null,
    fecha: fechaDate,
    total,
    uuid: uuidNormalized,
    sello,
    selloUltimos8: selloUltimos8FromSello(sello),
    taxes,
  };
}

/**
 * Extracts and normalizes tax breakdowns from cfdi:Impuestos node.
 * @param {Object|undefined} impuestos - Parsed cfdi:Impuestos node
 * @returns {{ totalTrasladados: number|null, totalRetenidos: number|null, traslados: Array, retenciones: Array }}
 */
function extractTaxes(impuestos) {
  if (!impuestos) {
    return { totalTrasladados: null, totalRetenidos: null, traslados: [], retenciones: [] };
  }

  const totalTrasladados = impuestos["@_TotalImpuestosTrasladados"]
    ? parseFloat(impuestos["@_TotalImpuestosTrasladados"])
    : null;

  const totalRetenidos = impuestos["@_TotalImpuestosRetenidos"]
    ? parseFloat(impuestos["@_TotalImpuestosRetenidos"])
    : null;

  const traslados = (impuestos.Traslados?.Traslado ?? []).map((t) => ({
    base: parseFloat(t["@_Base"]),
    impuesto: t["@_Impuesto"],
    impuestoNombre: IMPUESTO_NOMBRES[t["@_Impuesto"]] ?? t["@_Impuesto"],
    tipoFactor: t["@_TipoFactor"],
    tasaOCuota: parseFloat(t["@_TasaOCuota"]),
    importe: parseFloat(t["@_Importe"]),
  }));

  const retenciones = (impuestos.Retenciones?.Retencion ?? []).map((r) => ({
    impuesto: r["@_Impuesto"],
    impuestoNombre: IMPUESTO_NOMBRES[r["@_Impuesto"]] ?? r["@_Impuesto"],
    importe: parseFloat(r["@_Importe"]),
  }));

  return { totalTrasladados, totalRetenidos, traslados, retenciones };
}

/**
 * Construye el cuerpo JSON esperado por POST /api/comprobantes/:receipt_id (validateCfdi + insertarCfdi)
 * a partir del XML timbrado. El PDF no interviene (solo respaldo).
 *
 * @param {string} xmlString
 * @returns {Record<string, unknown>} Campos en snake_case listos para el API
 * @throws {CfdiParseError}
 */
export function buildComprobanteRegistroBodyFromXml(xmlString) {
  if (!xmlString || typeof xmlString !== "string" || !xmlString.trim()) {
    throw new CfdiParseError("El contenido XML está vacío", "EMPTY_XML");
  }

  let parsed;
  try {
    parsed = parser.parse(xmlString);
  } catch (err) {
    throw new CfdiParseError(`XML malformado: ${err.message}`, "INVALID_XML");
  }

  const comprobante = getComprobanteRoot(parsed);
  if (!comprobante) {
    throw new CfdiParseError(
      "Nodo Comprobante no encontrado",
      "MISSING_COMPROBANTE",
    );
  }

  const version = comprobante["@_Version"];
  if (!version || !SUPPORTED_VERSIONS.includes(String(version))) {
    throw new CfdiParseError(
      `Versión CFDI no soportada para registro: ${version}`,
      "UNSUPPORTED_VERSION",
    );
  }

  const emisor = comprobante.Emisor;
  const receptor = comprobante.Receptor;
  if (!emisor?.["@_Rfc"] || !receptor?.["@_Rfc"]) {
    throw new CfdiParseError("Emisor o Receptor sin RFC", "MISSING_RFC");
  }

  const complemento = comprobante.Complemento;
  const timbre = complemento?.TimbreFiscalDigital;
  if (!timbre?.["@_UUID"] || !timbre["@_FechaTimbrado"] || !timbre["@_RfcProvCertif"]) {
    throw new CfdiParseError(
      "TimbreFiscalDigital incompleto (UUID, FechaTimbrado o RfcProvCertif)",
      "MISSING_TIMBRE_FIELDS",
    );
  }

  const uuid = String(timbre["@_UUID"]).toUpperCase().trim();
  const fechaTimbrado = String(timbre["@_FechaTimbrado"]).trim();
  const rfcPac = String(timbre["@_RfcProvCertif"]).trim().toUpperCase();

  const fechaEmision = comprobante["@_Fecha"];
  if (!fechaEmision) {
    throw new CfdiParseError("Falta Fecha del comprobante", "MISSING_FECHA");
  }

  const tipoComprobante = comprobante["@_TipoDeComprobante"];
  if (!tipoComprobante) {
    throw new CfdiParseError("Falta TipoDeComprobante", "MISSING_TIPO_COMPROBANTE");
  }

  const lugarExp = comprobante["@_LugarExpedicion"];
  if (!lugarExp || !/^\d{5}$/.test(String(lugarExp).trim())) {
    throw new CfdiParseError(
      "LugarExpedicion debe ser CP de 5 dígitos",
      "INVALID_LUGAR_EXPEDICION",
    );
  }

  const metodoPago = comprobante["@_MetodoPago"];
  if (!metodoPago || !["PUE", "PPD"].includes(String(metodoPago))) {
    throw new CfdiParseError("MetodoPago debe ser PUE o PPD", "INVALID_METODO_PAGO");
  }

  const formaPago = comprobante["@_FormaPago"];
  if (!formaPago || String(formaPago).trim().length !== 2) {
    throw new CfdiParseError("FormaPago debe ser código de 2 caracteres", "INVALID_FORMA_PAGO");
  }

  const moneda = (comprobante["@_Moneda"] || "MXN").toString().trim().toUpperCase();
  if (moneda.length !== 3) {
    throw new CfdiParseError("Moneda inválida", "INVALID_MONEDA");
  }

  const subtotal = parseFloat(comprobante["@_SubTotal"]);
  const total = parseFloat(comprobante["@_Total"]);
  if (Number.isNaN(subtotal) || Number.isNaN(total)) {
    throw new CfdiParseError("SubTotal o Total inválidos", "INVALID_TOTALES");
  }

  const descRaw = comprobante["@_Descuento"];
  const descuento = descRaw !== undefined && descRaw !== "" ? parseFloat(descRaw) : 0;
  const tipoCambioRaw = comprobante["@_TipoCambio"];
  const tipoCambio =
    tipoCambioRaw !== undefined && tipoCambioRaw !== ""
      ? parseFloat(tipoCambioRaw)
      : 1.0;

  const iva = sumIvaTrasladosFromImpuestos(comprobante.Impuestos);

  const nombreEmisor = String(emisor["@_Nombre"] || "").trim();
  const nombreReceptor = String(receptor["@_Nombre"] || "").trim();
  if (!nombreEmisor || !nombreReceptor) {
    throw new CfdiParseError("Nombre emisor o receptor vacío", "MISSING_NOMBRE");
  }

  const regFisEm = String(emisor["@_RegimenFiscal"] || "").trim();
  const regFisRec = String(receptor["@_RegimenFiscalReceptor"] || "").trim();
  if (regFisEm.length !== 3 || regFisRec.length !== 3) {
    throw new CfdiParseError("Régimen fiscal emisor/receptor debe ser 3 dígitos", "INVALID_REGIMEN");
  }

  const domFiscal = String(receptor["@_DomicilioFiscalReceptor"] || "").trim();
  if (!/^\d{5}$/.test(domFiscal)) {
    throw new CfdiParseError("DomicilioFiscalReceptor debe ser CP de 5 dígitos", "INVALID_DOM_FISCAL");
  }

  const usoCfdi = String(receptor["@_UsoCFDI"] || "").trim();
  if (usoCfdi.length < 2 || usoCfdi.length > 4) {
    throw new CfdiParseError("UsoCFDI inválido", "INVALID_USO_CFDI");
  }

  const selloRaw = comprobante["@_Sello"];
  const selloEmisor =
    selloRaw !== null && selloRaw !== undefined && String(selloRaw).trim().length >= 8
      ? String(selloRaw).trim()
      : undefined;

  const exportacion = (comprobante["@_Exportacion"] || "01").toString().trim();
  const serie =
    comprobante["@_Serie"] !== null && comprobante["@_Serie"] !== undefined
      ? String(comprobante["@_Serie"]).trim()
      : undefined;
  const folio =
    comprobante["@_Folio"] !== null && comprobante["@_Folio"] !== undefined
      ? String(comprobante["@_Folio"]).trim()
      : undefined;

  const fechaEmisionIso = new Date(fechaEmision).toISOString();
  let fechaTimbradoIso;
  try {
    fechaTimbradoIso = new Date(fechaTimbrado).toISOString();
  } catch {
    throw new CfdiParseError("FechaTimbrado inválida", "INVALID_FECHA_TIMBRADO");
  }

  /** @type {Record<string, unknown>} */
  const body = {
    uuid,
    fecha_timbrado: fechaTimbradoIso,
    rfc_pac: rfcPac,
    version: String(version),
    serie: serie || undefined,
    folio: folio || undefined,
    fecha_emision: fechaEmisionIso,
    tipo_comprobante: String(tipoComprobante).trim(),
    lugar_expedicion: String(lugarExp).trim(),
    exportacion,
    metodo_pago: String(metodoPago).trim(),
    forma_pago: String(formaPago).trim(),
    moneda,
    tipo_cambio: tipoCambio,
    subtotal,
    descuento: Number.isNaN(descuento) ? 0 : descuento,
    iva,
    total,
    rfc_emisor: String(emisor["@_Rfc"]).toUpperCase().trim(),
    nombre_emisor: nombreEmisor,
    regimen_fiscal_emisor: regFisEm,
    rfc_receptor: String(receptor["@_Rfc"]).toUpperCase().trim(),
    nombre_receptor: nombreReceptor,
    domicilio_fiscal_receptor: domFiscal,
    regimen_fiscal_receptor: regFisRec,
    uso_cfdi: usoCfdi,
  };

  if (selloEmisor) {
    body.sello_emisor = selloEmisor;
  }

  return body;
}
