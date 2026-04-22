/**
 * @module satConsultaService
 * @description Cliente SOAP para Consulta de Estado de CFDI (SAT).
 * WSDL: https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc?wsdl
 */
import soap from "soap";

const DEFAULT_WSDL =
  "https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc?wsdl";

const DEFAULT_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/**
 * Arma expresionImpresa para el metodo Consulta del SAT.
 * @param {Object} p
 * @param {string} p.rfcEmisor
 * @param {string} p.rfcReceptor
 * @param {number} p.total
 * @param {string} p.uuid - UUID del timbre (mayusculas)
 * @param {string|null} [p.selloUltimos8] - Ultimos 8 caracteres del Sello (opcional)
 * @returns {string}
 */
export function buildExpresionImpresa({ rfcEmisor, rfcReceptor, total, uuid, selloUltimos8 = null }) {
  const tt = Number(total).toFixed(2);
  const id = String(uuid).toUpperCase().trim();
  let s = `?re=${rfcEmisor}&rr=${rfcReceptor}&tt=${tt}&id=${id}`;
  if (selloUltimos8 && String(selloUltimos8).length >= 8) {
    s += `&fe=${String(selloUltimos8).slice(-8)}`;
  }
  return s;
}

/**
 * @param {unknown} raw - Respuesta cruda de node-soap
 * @returns {{ codigoEstatus: string, estado: string, esCancelable: string, estatusCancelacion: string, validacionEFOS: string, raw: unknown }}
 */
export function normalizeConsultaResult(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const block =
    root.ConsultaResult ??
    root.consultaResult ??
    root.return ??
    root;

  const codigoEstatus = String(block.CodigoEstatus ?? block.codigoEstatus ?? "").trim();
  const estado = String(block.Estado ?? block.estado ?? "").trim();
  const esCancelable = String(block.EsCancelable ?? block.esCancelable ?? "").trim();
  const estatusCancelacion = String(
    block.EstatusCancelacion ?? block.estatusCancelacion ?? ""
  ).trim();
  let validacionEFOS = String(block.ValidacionEFOS ?? block.validacionEFOS ?? "").trim();
  if (!validacionEFOS && estado === "Vigente") {
    validacionEFOS = "200";
  }

  return {
    codigoEstatus,
    estado,
    esCancelable,
    estatusCancelacion,
    validacionEFOS,
    raw,
  };
}

/**
 * Resolves after the given number of milliseconds.
 * @param {number} ms Milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wraps a promise with a timeout that rejects with the given label.
 * @param {Promise<*>} promise Promise to race against the timer.
 * @param {number} ms Timeout in milliseconds.
 * @param {string} label Error label to reject with on timeout.
 * @returns {Promise<*>} Resolves with the promise value or rejects on timeout.
 */
function withTimeout(promise, ms, label = "SAT_TIMEOUT") {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Una llamada SOAP al SAT (sin reintentos).
 * @param {Object} input - Mismos campos que buildExpresionImpresa
 * @returns {Promise<{ codigoEstatus: string, estado: string, esCancelable: string, estatusCancelacion: string, validacionEFOS: string, raw: unknown }>}
 */
export async function consultarCfdiOnce(input) {
  const wsdl = process.env.SAT_WSDL_URL || DEFAULT_WSDL;
  const timeoutMs = Number(process.env.SAT_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const expresionImpresa = buildExpresionImpresa(input);

  const client = await soap.createClientAsync(wsdl);
  const call = client.ConsultaAsync({ expresionImpresa });
  const result = await withTimeout(call, timeoutMs, "SAT_TIMEOUT");
  const payload = Array.isArray(result) ? result[0] : result;
  return normalizeConsultaResult(payload);
}

/**
 * Consulta con reintentos (backoff 1s, 2s, 4s).
 * @param {Object} input
 * @returns {Promise<ReturnType<typeof normalizeConsultaResult>>}
 */
export async function consultarCfdiWithRetries(input) {
  let lastErr;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      return await consultarCfdiOnce(input);
    } catch (e) {
      lastErr = e;
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  throw lastErr ?? new Error("SAT_UNAVAILABLE");
}

/**
 * Convierte acuse normalizado a campos snake_case para createCfdi / update.
 * @param {ReturnType<typeof normalizeConsultaResult>} acuse
 * @returns {Object}
 */
export function acuseToCfdiRow(acuse) {
  return {
    sat_codigo_estatus: acuse.codigoEstatus,
    sat_estado: acuse.estado,
    sat_es_cancelable: acuse.esCancelable || null,
    sat_estatus_cancelacion: acuse.estatusCancelacion || null,
    sat_validacion_efos: acuse.validacionEFOS || "200",
  };
}
