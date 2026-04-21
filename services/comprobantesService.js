/**
 * @file services/comprobantesService.js
 * @description Business logic for CFDI 4.0 comprobante insertion (M1-003).
 *
 * EFOS codes from SAT Servicio de Consulta CFDI v1.4:
 *   100, 101, 104 → RFC Emisor en lista EFOS → rechazado
 *   102, 103       → Solo RFC terceros en EFOS → permitido (se guarda para auditoría)
 *   200, 201       → Limpio ✅
 *
 * @author Hector Lugo
 */
import ComprobantesModel from "../models/comprobantesModel.js";
import { selloUltimos8FromSello } from "./cfdiParserService.js";
import { consultarCfdiWithRetries, acuseToCfdiRow } from "./satConsultaService.js";
import { assertRequestAllowsReceiptUpload } from "./requestReceiptUploadPolicy.js";

/**
 * EFOS codes where the RFC Emisor itself appears in the blacklist.
 * Per Art. 69-B CFF, these should be rejected at insertion.
 */
const EFOS_EMISOR_BLACKLISTED = ["100", "101", "104"];

/**
 * Inserta un CFDI 4.0 validando:
 *  1. Que el Receipt exista
 *  2. Consulta al SAT (expresionImpresa); acuse no viene del cliente
 *  3. Que el CFDI esté Vigente según el SAT
 *  4. Que el RFC Emisor no esté en lista EFOS
 *  5. Que el UUID no esté duplicado en nuestra BD
 * @param {number} receiptId
 * @param {Object} cfdiData - Campos CFDI 4.0; opcional sello_emisor (Sello del XML) para parametro fe
 * @returns {Promise<Object>} CfdiComprobante creado
 */
export async function insertarCfdi(receiptId, cfdiData) {
  const { sello_emisor: selloEmisorRaw, ...cfdiRest } = cfdiData;
  const selloUltimos8 = selloUltimos8FromSello(selloEmisorRaw);

  // 1. Verificar que el Receipt exista
  const receipt = await ComprobantesModel.findReceiptById(receiptId);
  if (!receipt) {
    throw { status: 404, message: `Receipt ${receiptId} not found` };
  }

  if (receipt.requestId === null || receipt.requestId === undefined) {
    throw { status: 400, message: "El recibo no está ligado a una solicitud de viaje" };
  }
  await assertRequestAllowsReceiptUpload(receipt.requestId);

  // 2. Verificar unicidad del UUID antes de llamar al SAT
  const existing = await ComprobantesModel.findByUUID(cfdiRest.uuid);
  if (existing) {
    throw {
      status: 409,
      message: `El UUID ${cfdiRest.uuid} ya fue registrado (cfdi_id: ${existing.cfdiId})`,
    };
  }

  let acuse;
  try {
    acuse = await consultarCfdiWithRetries({
      rfcEmisor: cfdiRest.rfc_emisor,
      rfcReceptor: cfdiRest.rfc_receptor,
      total: cfdiRest.total,
      uuid: cfdiRest.uuid,
      selloUltimos8,
    });
  } catch (e) {
    const msg = e?.message === "SAT_TIMEOUT"
      ? "El servicio del SAT no respondio a tiempo. Intente mas tarde."
      : "No se pudo consultar el estado del CFDI en el SAT. Intente mas tarde.";
    throw { status: 503, message: msg };
  }

  const satRow = acuseToCfdiRow(acuse);
  const merged = { ...cfdiRest, ...satRow };

  // 3. Verificar que el CFDI esté Vigente en el SAT
  if (merged.sat_estado !== "Vigente") {
    throw {
      status: 409,
      message: `El CFDI no puede registrarse: estado SAT es "${merged.sat_estado}"`,
    };
  }

  // 4. Rechazar si el RFC Emisor está en lista EFOS (códigos 100, 101, 104)
  if (EFOS_EMISOR_BLACKLISTED.includes(String(merged.sat_validacion_efos))) {
    throw {
      status: 409,
      message: `El RFC Emisor ${merged.rfc_emisor} está en la lista EFOS (código ${merged.sat_validacion_efos}). Ver Art. 69-B CFF.`,
    };
  }

  // 5. Insertar con transacción atómica (rollback automático en error)
  return ComprobantesModel.createCfdi(receiptId, merged);
}
