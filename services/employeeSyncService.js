/**
 * @module employeeSyncService
 * @description Sincronización de catálogo empleado desde RH/SAP.
 */
import EmployeeModel from "../models/employeeModel.js";

const VALID_TYPES = new Set(["Alta", "Baja", "Cambio", "Reingreso"]);

/**
 *
 * @param isoDate
 */
function asDate(isoDate) {
  const d = new Date(String(isoDate));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 *
 * @param payload
 */
function validatePayload(payload) {
  const idTransaction = payload?.header?.idTransaction;
  const detalle = payload?.detalle;
  if (!idTransaction || !detalle) {
    throw { status: 400, message: "Payload inválido: header.idTransaction y detalle son obligatorios" };
  }
  const required = ["noEmpleado", "nombre", "proveedor", "ceco", "fechaAlta", "tipo"];
  for (const k of required) {
    if (!detalle?.[k]) throw { status: 400, message: `Campo obligatorio faltante: detalle.${k}` };
  }
  if (!VALID_TYPES.has(detalle.tipo)) {
    throw { status: 400, message: "detalle.tipo debe ser Alta|Baja|Cambio|Reingreso" };
  }
  const parsed = asDate(detalle.fechaAlta);
  if (!parsed) throw { status: 400, message: "detalle.fechaAlta debe ser fecha válida YYYY-MM-DD" };
  return { idTransaction: String(idTransaction), detalle, fechaAlta: parsed };
}

/**
 *
 * @param reqUser
 */
function actorFromReqUser(reqUser) {
  if (reqUser?.user_name) return String(reqUser.user_name).slice(0, 30);
  if (reqUser?.user_id != null) return `user_${String(reqUser.user_id)}`.slice(0, 30);
  return "api_sync";
}

/**
 * @param {bigint|number|string} organizationId
 * @param {object} payload
 * @param {object|null} reqUser
 */
export async function syncEmployee(organizationId, payload, reqUser = null) {
  const { idTransaction, detalle, fechaAlta } = validatePayload(payload);
  const actor = actorFromReqUser(reqUser);
  const existing = await EmployeeModel.findByNoEmpleado(organizationId, detalle.noEmpleado);
  const baseData = {
    nombre: String(detalle.nombre).slice(0, 100),
    email: detalle.email ? String(detalle.email).slice(0, 100) : null,
    jefeInmediato: detalle.jefeInmediato ? String(detalle.jefeInmediato).slice(0, 10) : null,
    proveedor: String(detalle.proveedor).slice(0, 11),
    ceco: String(detalle.ceco).slice(0, 10),
    fechaAlta,
    usuarioUltimaModificacion: actor,
  };

  if (detalle.tipo === "Alta") {
    if (existing) {
      throw { status: 409, message: `Empleado ${detalle.noEmpleado} ya existe` };
    }
    await EmployeeModel.createEmpleado({
      organizationId: BigInt(organizationId),
      noEmpleado: String(detalle.noEmpleado).slice(0, 10),
      ...baseData,
      status: "A",
    });
    return {
      idTransaction,
      status: "success",
      noEmpleado: String(detalle.noEmpleado),
      accion_realizada: "created",
    };
  }

  if (!existing) {
    throw { status: 404, message: `Empleado ${detalle.noEmpleado} no existe` };
  }

  if (detalle.tipo === "Baja") {
    await EmployeeModel.updateEmpleado(organizationId, detalle.noEmpleado, {
      status: "I",
      usuarioUltimaModificacion: actor,
    });
    return {
      idTransaction,
      status: "success",
      noEmpleado: String(detalle.noEmpleado),
      accion_realizada: "deactivated",
    };
  }

  if (detalle.tipo === "Reingreso") {
    await EmployeeModel.updateEmpleado(organizationId, detalle.noEmpleado, {
      ...baseData,
      status: "A",
    });
    return {
      idTransaction,
      status: "success",
      noEmpleado: String(detalle.noEmpleado),
      accion_realizada: "reactivated",
    };
  }

  await EmployeeModel.updateEmpleado(organizationId, detalle.noEmpleado, baseData);
  return {
    idTransaction,
    status: "success",
    noEmpleado: String(detalle.noEmpleado),
    accion_realizada: "updated",
  };
}

export default {
  syncEmployee,
};
