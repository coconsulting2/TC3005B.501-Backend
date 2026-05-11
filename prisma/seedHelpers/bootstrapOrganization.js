/**
 * @file prisma/seedHelpers/bootstrapOrganization.js
 * @description Per-organization bootstrap helper. Idempotente. Crea los catálogos
 *   default de una org (roles, grupos de permisos, mensajes de alerta, tipos de
 *   comprobante, plantillas de notificación, catálogo contable). Se llama tanto
 *   desde el seed inicial como desde organizationService.createOrganization()
 *   al onboardear una nueva org cliente desde la UI.
 *
 * El parámetro `kind` determina qué grupos especiales se incluyen:
 *   - 'ROOT' (Ditta):   grupo DittaSuperAdmin + role Admin Ditta.
 *   - 'CLIENT' (resto): grupos default sin DittaSuperAdmin.
 */
import bcrypt from "bcrypt";
import { ACCOUNTING_CATALOG_DEFAULTS } from "../../config/accountingCatalogs.js";

const SALT_ROUNDS = 10;

/**
 * Catálogo de permisos del sistema. La fuente de verdad está en prisma/seed.js
 * (PERMISSION_CATALOG). Aquí solo se referencian por code.
 */
const PERMISSION_GROUPS_DEFAULTS = [
  {
    groupName: "TravelRequestAuthor",
    description: "Solicitante — crea y da seguimiento a sus propias solicitudes",
    permissions: [
      "travel_request:create", "travel_request:view_own", "travel_request:view_any",
      "travel_request:edit_own", "travel_request:submit", "travel_request:cancel",
      "receipt:upload", "receipt:delete_own", "receipt:view_sat",
      "expense:view", "expense:submit",
      "policy:read",
      "user:view_self",
    ],
  },
  {
    groupName: "TravelRequestApprover",
    description: "Autorizadores N1/N2 — solicitante + autorizar/rechazar",
    permissions: [
      "travel_request:create", "travel_request:view_own", "travel_request:view_any",
      "travel_request:edit_own", "travel_request:submit", "travel_request:cancel",
      "travel_request:authorize",
      "receipt:upload", "receipt:delete_own", "receipt:view_sat",
      "expense:view", "expense:submit",
      "authorizer:view_alerts",
      "policy:read", "expense:authorize_exception",
      "user:view_self",
    ],
  },
  {
    groupName: "TravelAgencyOps",
    description: "Agencia de viajes — atiende reservas",
    permissions: [
      "travel_agent:attend",
      "travel_request:view_any",
      "user:view_self",
    ],
  },
  {
    groupName: "AccountsPayableOps",
    description: "Cuentas por pagar — valida comprobantes y exporta contabilidad",
    permissions: [
      "accounts_payable:attend",
      "accounting:export",
      "receipt:validate", "receipt:view_sat",
      "expense:view",
      "travel_request:view_any",
      "policy:read",
      "accounting_catalog:read",
      "user:view_self",
    ],
  },
  {
    groupName: "OrgAdmin",
    description: "Administrador de la organización — gestiona usuarios, roles, catálogos",
    permissions: [
      "user:list", "user:create", "user:edit",
      "permission:read", "permission:write", "permission_group:manage",
      "role:manage_permissions", "user:manage_permissions",
      "policy:read", "policy:manage",
      "receipt_type:write",
      "alert_message:write",
      "accounting_catalog:read", "accounting_catalog:write",
      "notification_template:read", "notification_template:write",
      "integration:read", "integration:write",
      "organization:read", "organization:update",
      "user:view_self",
    ],
  },
  {
    groupName: "TravelNotifyOnly",
    description: "Solo alertas y lectura — sin autorizar",
    permissions: [
      "travel_request:view_any",
      "authorizer:view_alerts",
      "user:view_self",
    ],
  },
];

const DITTA_SUPER_ADMIN_GROUP = {
  groupName: "DittaSuperAdmin",
  description: "Super-admin Ditta — gestión cross-tenant",
  permissions: [
    "organization:create", "organization:list_all", "organization:read",
    "organization:update", "organization:activate", "organization:suspend",
    "organization:impersonate", "organization:manage_any",
    "user:list", "user:create", "user:edit",
    "permission:read", "permission:write", "permission_group:manage",
    "role:manage_permissions", "user:manage_permissions",
    "policy:read", "policy:manage",
    "integration:read", "integration:write",
    "accounting_catalog:read", "accounting_catalog:write",
    "notification_template:read", "notification_template:write",
    "receipt_type:write", "alert_message:write",
    "user:view_self",
  ],
};

const DEFAULT_ALERT_MESSAGES = [
  "Se ha abierto una solicitud.",
  "Se requiere tu revisión para Primera Revisión.",
  "Se requiere tu revisión para Segunda Revisión.",
  "La solicitud está lista para generar su cotización de viaje.",
  "Se deben asignar los servicios del viaje para la solicitud.",
  "Se requiere validar comprobantes de los gastos del viaje.",
  "Los comprobantes están listos para validación.",
];

const DEFAULT_RECEIPT_TYPES = [
  "Hospedaje",
  "Comida",
  "Transporte",
  "Caseta",
  "Autobús",
  "Vuelo",
  "Otro",
];

const DEFAULT_NOTIFICATION_TEMPLATES = [
  {
    code: "request.submitted",
    channel: "EMAIL",
    subject: "Tu solicitud de viáticos fue enviada",
    body: "Hola {{userName}}, tu solicitud #{{requestId}} fue enviada para revisión.",
  },
  {
    code: "request.approved",
    channel: "EMAIL",
    subject: "Tu solicitud fue aprobada",
    body: "Tu solicitud #{{requestId}} fue aprobada por {{approverName}}.",
  },
  {
    code: "request.rejected",
    channel: "EMAIL",
    subject: "Tu solicitud fue rechazada",
    body: "Tu solicitud #{{requestId}} fue rechazada. Motivo: {{reason}}.",
  },
  {
    code: "receipt.expired",
    channel: "INAPP",
    subject: null,
    body: "El plazo de comprobación de tu viaje #{{requestId}} venció.",
  },
];

/**
 * Roles base que cada org recibe. Mariano: cada org puede crear roles custom además.
 */
const DEFAULT_ROLES = [
  { roleName: "Solicitante",       maxApprovalAmount: null },
  { roleName: "Agencia de viajes", maxApprovalAmount: null },
  { roleName: "Cuentas por pagar", maxApprovalAmount: null },
  { roleName: "N1",                maxApprovalAmount: 50_000 },
  { roleName: "N2",                maxApprovalAmount: 500_000 },
  { roleName: "Administrador",     maxApprovalAmount: null },
  { roleName: "Observador",        maxApprovalAmount: null },
];

const ROLE_GROUP_ASSIGNMENTS_DEFAULT = {
  "Solicitante":         ["TravelRequestAuthor"],
  "N1":                  ["TravelRequestApprover"],
  "N2":                  ["TravelRequestApprover"],
  "Agencia de viajes":   ["TravelAgencyOps"],
  "Cuentas por pagar":   ["AccountsPayableOps"],
  "Administrador":       ["OrgAdmin"],
  "Observador":          ["TravelNotifyOnly"],
};

/**
 * Bootstrappa los catálogos default de una organización.
 * Idempotente: usa upsert por unique compuesto (organizationId, code/name).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {bigint|number} organizationId
 * @param {object} opts
 * @param {boolean} [opts.includeDittaSuperAdmin=false] - solo true para la org ROOT.
 * @returns {Promise<{rolesByName: Map<string, number>}>}
 */
export async function bootstrapOrganizationCatalogs(prisma, organizationId, opts = {}) {
  const orgIdBig = BigInt(organizationId);
  const { includeDittaSuperAdmin = false } = opts;

  // ── 1. AlertMessages ────────────────────────────────────────────────
  for (const text of DEFAULT_ALERT_MESSAGES) {
    const existing = await prisma.alertMessage.findFirst({
      where: { organizationId: orgIdBig, messageText: text },
    });
    if (!existing) {
      await prisma.alertMessage.create({
        data: { organizationId: orgIdBig, messageText: text, isSystem: true },
      });
    }
  }

  // ── 2. ReceiptTypes ─────────────────────────────────────────────────
  for (const name of DEFAULT_RECEIPT_TYPES) {
    await prisma.receiptType.upsert({
      where: { organizationId_receiptTypeName: { organizationId: orgIdBig, receiptTypeName: name } },
      update: { isSystem: true },
      create: { organizationId: orgIdBig, receiptTypeName: name, isSystem: true },
    });
  }

  // ── 3. PermissionGroups + items ─────────────────────────────────────
  const groupsToSeed = includeDittaSuperAdmin
    ? [...PERMISSION_GROUPS_DEFAULTS, DITTA_SUPER_ADMIN_GROUP]
    : PERMISSION_GROUPS_DEFAULTS;

  const groupsByName = new Map();
  for (const g of groupsToSeed) {
    const group = await prisma.permissionGroup.upsert({
      where: { organizationId_groupName: { organizationId: orgIdBig, groupName: g.groupName } },
      update: { description: g.description, active: true, isSystem: true },
      create: { organizationId: orgIdBig, groupName: g.groupName, description: g.description, isSystem: true },
    });
    groupsByName.set(g.groupName, group.groupId);

    const perms = await prisma.permission.findMany({
      where: { code: { in: g.permissions } },
      select: { permissionId: true, code: true },
    });

    if (perms.length > 0) {
      await prisma.permissionGroupItem.createMany({
        data: perms.map((p) => ({ groupId: group.groupId, permissionId: p.permissionId })),
        skipDuplicates: true,
      });
    }
  }

  // ── 4. Roles + asignación a grupos ──────────────────────────────────
  const rolesToSeed = includeDittaSuperAdmin
    ? [...DEFAULT_ROLES, { roleName: "Admin Ditta", maxApprovalAmount: null }]
    : DEFAULT_ROLES;

  const rolesByName = new Map();
  for (const r of rolesToSeed) {
    const role = await prisma.role.upsert({
      where: { organizationId_roleName: { organizationId: orgIdBig, roleName: r.roleName } },
      update: { maxApprovalAmount: r.maxApprovalAmount, isSystem: true },
      create: { organizationId: orgIdBig, roleName: r.roleName, maxApprovalAmount: r.maxApprovalAmount, isSystem: true },
    });
    rolesByName.set(r.roleName, role.roleId);
  }

  const assignments = { ...ROLE_GROUP_ASSIGNMENTS_DEFAULT };
  if (includeDittaSuperAdmin) {
    assignments["Admin Ditta"] = ["DittaSuperAdmin"];
  }

  for (const [roleName, groupNames] of Object.entries(assignments)) {
    const roleId = rolesByName.get(roleName);
    if (!roleId) continue;
    const data = groupNames
      .map((gn) => groupsByName.get(gn))
      .filter(Boolean)
      .map((groupId) => ({ roleId, groupId }));
    if (data.length > 0) {
      await prisma.rolePermissionGroup.createMany({ data, skipDuplicates: true });
    }
  }

  // ── 5. Notification templates ───────────────────────────────────────
  for (const t of DEFAULT_NOTIFICATION_TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: {
        organizationId_code_channel_locale: {
          organizationId: orgIdBig,
          code: t.code,
          channel: t.channel,
          locale: "es-MX",
        },
      },
      update: { subject: t.subject, body: t.body, isSystem: true },
      create: {
        organizationId: orgIdBig,
        code: t.code,
        channel: t.channel,
        subject: t.subject,
        body: t.body,
        locale: "es-MX",
        isSystem: true,
      },
    });
  }

  // ── 6. Reimbursement time limit (RF-37) ─────────────────────────────
  await prisma.reimbursementTimeLimit.upsert({
    where: { organizationId: orgIdBig },
    update: {},
    create: {
      organizationId: orgIdBig,
      daysAfterTrip: 14,
      graceDays: 0,
      blockOnExpiry: true,
    },
  });

  // ── 7. Catálogo contable (RF-74) ────────────────────────────────────
  if (ACCOUNTING_CATALOG_DEFAULTS?.chartOfAccounts) {
    for (const acc of ACCOUNTING_CATALOG_DEFAULTS.chartOfAccounts) {
      await prisma.chartOfAccount.upsert({
        where: { organizationId_accountCode: { organizationId: orgIdBig, accountCode: acc.code } },
        update: { accountName: acc.name, accountType: acc.type, isSystem: true },
        create: {
          organizationId: orgIdBig,
          accountCode: acc.code,
          accountName: acc.name,
          accountType: acc.type,
          isSystem: true,
        },
      });
    }
  }
  if (ACCOUNTING_CATALOG_DEFAULTS?.docTypes) {
    for (const dt of ACCOUNTING_CATALOG_DEFAULTS.docTypes) {
      await prisma.accountingDocType.upsert({
        where: { organizationId_code: { organizationId: orgIdBig, code: dt.code } },
        update: { name: dt.name, isSystem: true },
        create: { organizationId: orgIdBig, code: dt.code, name: dt.name, isSystem: true },
      });
    }
  }
  if (ACCOUNTING_CATALOG_DEFAULTS?.societies) {
    for (const s of ACCOUNTING_CATALOG_DEFAULTS.societies) {
      await prisma.accountingSociety.upsert({
        where: { organizationId_code: { organizationId: orgIdBig, code: s.code } },
        update: { name: s.name, isSystem: true },
        create: { organizationId: orgIdBig, code: s.code, name: s.name, isSystem: true },
      });
    }
  }

  return { rolesByName, groupsByName };
}

/**
 * Crea (o reusa) un usuario admin inicial para la organización con el role Admin Ditta o Administrador.
 * Usado por el seed para Ditta y por organizationService.createOrganization para clientes nuevos.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {bigint|number} organizationId
 * @param {{ email: string, userName: string, password: string, roleName?: string }} params
 */
export async function ensureOrganizationAdmin(prisma, organizationId, params) {
  const orgIdBig = BigInt(organizationId);
  const roleName = params.roleName ?? "Administrador";
  const role = await prisma.role.findUnique({
    where: { organizationId_roleName: { organizationId: orgIdBig, roleName } },
  });
  if (!role) {
    throw new Error(`Role "${roleName}" not found for org ${organizationId}. Run bootstrapOrganizationCatalogs first.`);
  }
  const passwordHash = await bcrypt.hash(params.password, SALT_ROUNDS);
  await prisma.user.upsert({
    where: { userName: params.userName },
    update: { active: true, organizationId: orgIdBig, roleId: role.roleId },
    create: {
      organizationId: orgIdBig,
      roleId: role.roleId,
      userName: params.userName,
      password: passwordHash,
      workstation: "admin",
      email: params.email,
      active: true,
    },
  });
}
