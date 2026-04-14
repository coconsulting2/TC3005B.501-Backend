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

  const comprobante = parsed.Comprobante;
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
  const sello = selloRaw != null && selloRaw !== "" ? String(selloRaw).trim() : null;

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
