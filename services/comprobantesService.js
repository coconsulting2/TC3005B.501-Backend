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

/**
 * EFOS codes where the RFC Emisor itself appears in the blacklist.
 * Per Art. 69-B CFF, these should be rejected at insertion.
 */
const EFOS_EMISOR_BLACKLISTED = ["100", "101", "104"];

/**
 * Inserta un CFDI 4.0 validando:
 *  1. Que el Receipt exista
 *  2. Que el CFDI esté Vigente según el SAT
 *  3. Que el RFC Emisor no esté en lista EFOS
 *  4. Que el UUID no esté duplicado en nuestra BD
 * @param {number} receiptId
 * @param {Object} cfdiData - Campos CFDI 4.0 + Acuse SAT
 * @returns {Promise<Object>} CfdiComprobante creado
 */
export async function insertarCfdi(receiptId, cfdiData) {
  // 1. Verificar que el Receipt exista
  const receipt = await ComprobantesModel.findReceiptById(receiptId);
  if (!receipt) {
    throw { status: 404, message: `Receipt ${receiptId} not found` };
  }

  // 2. Verificar que el CFDI esté Vigente en el SAT
  if (cfdiData.sat_estado !== "Vigente") {
    throw {
      status: 409,
      message: `El CFDI no puede registrarse: estado SAT es "${cfdiData.sat_estado}"`,
    };
  }

  // 3. Rechazar si el RFC Emisor está en lista EFOS (códigos 100, 101, 104)
  if (EFOS_EMISOR_BLACKLISTED.includes(String(cfdiData.sat_validacion_efos))) {
    throw {
      status: 409,
      message: `El RFC Emisor ${cfdiData.rfc_emisor} está en la lista EFOS (código ${cfdiData.sat_validacion_efos}). Ver Art. 69-B CFF.`,
    };
  }

  // 4. Verificar unicidad del UUID (Folio Fiscal)
  const existing = await ComprobantesModel.findByUUID(cfdiData.uuid);
  if (existing) {
    throw {
      status: 409,
      message: `El UUID ${cfdiData.uuid} ya fue registrado (cfdi_id: ${existing.cfdiId})`,
    };
  }

  // 5. Insertar con transacción atómica (rollback automático en error)
  return ComprobantesModel.createCfdi(receiptId, cfdiData);
}
