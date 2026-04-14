import { readFile } from "fs/promises";

/**
 * @typedef {"vigente" | "vigente201" | "cancelado" | "noEncontrado" | "efos100" | "efos101" | "efos102" | "efos103" | "efos104"} SatScenario
 */

/**
 * @typedef {Object} InvoiceFixture
 * @property {SatScenario} satScenario
 * @property {number} amount
 * @property {string} uuid
 * @property {string} fecha_timbrado
 * @property {string} rfc_pac
 * @property {string} version
 * @property {string} serie
 * @property {string} folio
 * @property {string} fecha_emision
 * @property {string} tipo_comprobante
 * @property {string} lugar_expedicion
 * @property {string} exportacion
 * @property {string} metodo_pago
 * @property {string} forma_pago
 * @property {string} moneda
 * @property {number} tipo_cambio
 * @property {number} subtotal
 * @property {number} descuento
 * @property {number} iva
 * @property {number} total
 * @property {string} rfc_emisor
 * @property {string} nombre_emisor
 * @property {string} regimen_fiscal_emisor
 * @property {string} rfc_receptor
 * @property {string} nombre_receptor
 * @property {string} domicilio_fiscal_receptor
 * @property {string} regimen_fiscal_receptor
 * @property {string} uso_cfdi
 * @property {string} sat_codigo_estatus
 * @property {string} sat_estado
 * @property {string | null} sat_es_cancelable
 * @property {string | null} sat_estatus_cancelacion
 * @property {string} sat_validacion_efos
 */

const FIXTURE_FILE_URL = new URL("./invoices.jsonl", import.meta.url);

/**
 * @returns {Promise<InvoiceFixture[]>}
 */
export async function loadInvoiceFixtures() {
  const raw = await readFile(FIXTURE_FILE_URL, "utf-8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

/**
 * @param {InvoiceFixture[]} fixtures
 * @param {SatScenario} scenario
 * @returns {InvoiceFixture}
 */
export function pickRandomInvoiceByScenario(fixtures, scenario) {
  const candidates = fixtures.filter((fixture) => fixture.satScenario === scenario);
  if (!candidates.length) {
    throw new Error(`No invoice fixtures found for scenario '${scenario}'.`);
  }

  const randomIndex = Math.floor(Math.random() * candidates.length);
  return candidates[randomIndex];
}

