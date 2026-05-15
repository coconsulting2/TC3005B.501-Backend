/**
 * @file services/onboarding/permissionCatalog.js
 * @description Catálogo global de permisos agrupado por recurso (para UI de importación).
 */
import * as permissionModel from "../../models/permissionModel.js";

/** Etiquetas legibles por recurso (fallback: capitalizar). */
const RESOURCE_LABELS_ES = {
  user: "Usuarios",
  role: "Roles y permisos",
  permission: "Catálogo de permisos",
  policy: "Políticas de gasto",
  receipt_type: "Tipos de comprobante",
  travel_request: "Solicitudes de viaje",
  onboarding: "Onboarding",
  expense: "Gastos",
  receipt: "Comprobantes",
  refund: "Reembolsos",
  file: "Archivos",
  wallet: "Cartera / saldo",
  department: "Departamentos",
  workflow: "Flujos de trabajo",
  notification: "Notificaciones",
  report: "Reportes",
  organization: "Organización",
  audit: "Auditoría",
  accounting: "Contabilidad (Accounting)",
  accounts_payable: "Cuentas por pagar",
  travel_agent: "Agencia de viajes",
};

/**
 *
 * @param resource
 */
function formatResourceFallback(resource) {
  return String(resource || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @returns {Promise<{ groups: Array<{ resource: string, label: string, items: Array<{ code: string, action: string, description: string | null }> }> }>}
 */
export async function buildPermissionsCatalogGrouped() {
  const perms = await permissionModel.listPermissions({ activeOnly: true });
  const byResource = new Map();
  for (const p of perms) {
    const list = byResource.get(p.resource) ?? [];
    list.push({
      code: p.code,
      action: p.action,
      description: p.description,
    });
    byResource.set(p.resource, list);
  }

  const groups = [...byResource.entries()]
    .map(([resource, items]) => ({
      resource,
      label: RESOURCE_LABELS_ES[resource] ?? formatResourceFallback(resource),
      items: items.sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

  return { groups };
}
