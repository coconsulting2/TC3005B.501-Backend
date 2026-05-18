/**
 * @file prisma/seed.js
 * @description Seeds reference data (always) and dummy data (with "dev" arg).
 *
 * Tras el refactor multi-tenant (plan refactored-hugging-flask.md):
 *   - Permission catálogo (atómicos) queda GLOBAL.
 *   - RequestStatus, Country, City quedan GLOBALES.
 *   - Roles, AlertMessage, ReceiptType, PermissionGroup, NotificationTemplate,
 *     ChartOfAccount, etc. son PER-ORG y se siembran via bootstrapOrganizationCatalogs.
 *   - Ditta (id=1, ROOT) se bootstrappea aquí; orgs cliente quedan a cargo de
 *     prisma/seed-organizations.js para no mezclar concerns.
 *
 * Usage:
 *   node prisma/seed.js        # reference + Ditta + permisos
 *   node prisma/seed.js dev    # + dummy users/requests/routes/receipts via seed-organizations
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { bootstrapOrganizationCatalogs, ensureOrganizationAdmin } from "./seedHelpers/bootstrapOrganization.js";

const prisma = new PrismaClient();
const isDev = process.argv.includes("dev");

const DITTA_ORG_ID = 1n;
const DITTA_RFC = process.env.DITTA_RFC || null;
const DITTA_ADMIN_PASSWORD = process.env.DITTA_ADMIN_INITIAL_PASSWORD || "Ditta!Admin#2026";

/**
 * Catálogo GLOBAL de permisos atómicos. El código de los middlewares depende
 * de strings literales; agregar/quitar requiere release del software.
 */
const PERMISSION_CATALOG = [
  // Travel requests
  { code: "travel_request:create",    resource: "travel_request", action: "create" },
  { code: "travel_request:view_own",  resource: "travel_request", action: "view_own" },
  { code: "travel_request:view_any",  resource: "travel_request", action: "view_any" },
  { code: "travel_request:edit_own",  resource: "travel_request", action: "edit_own" },
  { code: "travel_request:submit",    resource: "travel_request", action: "submit" },
  { code: "travel_request:cancel",    resource: "travel_request", action: "cancel" },
  { code: "travel_request:authorize", resource: "travel_request", action: "authorize" },

  // Travel agency
  { code: "travel_agent:attend", resource: "travel_agent", action: "attend" },

  // Accounts payable
  { code: "accounts_payable:attend", resource: "accounts_payable", action: "attend" },
  { code: "accounting:export",       resource: "accounting",       action: "export" },

  // Receipts
  { code: "receipt:upload",     resource: "receipt", action: "upload" },
  { code: "receipt:delete_own", resource: "receipt", action: "delete_own" },
  { code: "receipt:validate",   resource: "receipt", action: "validate" },
  { code: "receipt:view_sat",   resource: "receipt", action: "view_sat" },

  // Expenses
  { code: "expense:view",                resource: "expense", action: "view" },
  { code: "expense:submit",              resource: "expense", action: "submit" },
  { code: "expense:authorize_exception", resource: "expense", action: "authorize_exception" },

  // Alerts
  { code: "authorizer:view_alerts", resource: "authorizer", action: "view_alerts" },

  // Users
  { code: "user:view_self",          resource: "user", action: "view_self" },
  { code: "user:list",               resource: "user", action: "list" },
  { code: "user:create",             resource: "user", action: "create" },
  { code: "user:edit",               resource: "user", action: "edit" },
  { code: "user:manage_permissions", resource: "user", action: "manage_permissions" },

  // Permission system meta
  { code: "permission:read",         resource: "permission",       action: "read" },
  { code: "permission:write",        resource: "permission",       action: "write" },
  { code: "permission_group:manage", resource: "permission_group", action: "manage" },
  { code: "role:manage_permissions", resource: "role",             action: "manage_permissions" },

  // Policies (M2-006)
  { code: "policy:read",   resource: "policy", action: "read" },
  { code: "policy:manage", resource: "policy", action: "manage" },

  // API keys por organización (M3-004 — panel admin para integraciones)
  { code: "api_key:manage", resource: "api_key", action: "manage" },

  // Multi-tenant
  { code: "organization:create",      resource: "organization", action: "create" },
  { code: "organization:list_all",    resource: "organization", action: "list_all" },
  { code: "organization:read",        resource: "organization", action: "read" },
  { code: "organization:update",      resource: "organization", action: "update" },
  { code: "organization:activate",    resource: "organization", action: "activate" },
  { code: "organization:suspend",     resource: "organization", action: "suspend" },
  { code: "organization:impersonate", resource: "organization", action: "impersonate" },
  { code: "organization:manage_any",  resource: "organization", action: "manage_any" },

  { code: "integration:read",  resource: "integration", action: "read" },
  { code: "integration:write", resource: "integration", action: "write" },

  { code: "accounting_catalog:read",  resource: "accounting_catalog", action: "read" },
  { code: "accounting_catalog:write", resource: "accounting_catalog", action: "write" },

  { code: "notification_template:read",  resource: "notification_template", action: "read" },
  { code: "notification_template:write", resource: "notification_template", action: "write" },

  { code: "receipt_type:write",  resource: "receipt_type",  action: "write" },
  { code: "alert_message:write", resource: "alert_message", action: "write" },

  // Onboarding import (M3-007)
  { code: "onboarding:import", resource: "onboarding", action: "import" },

  // Workflow rules management (org admin only)
  { code: "workflow:manage", resource: "workflow", action: "manage" },
];

async function seedGlobalPermissions() {
  console.warn("Seeding global permission catalog...");
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { resource: p.resource, action: p.action, active: true },
      create: { ...p, description: `${p.resource}:${p.action}` },
    });
  }
  console.warn(`  ${PERMISSION_CATALOG.length} permisos atómicos.`);
}

async function seedGlobalRequestStatus() {
  await prisma.requestStatus.createMany({
    data: [
      { status: "Borrador" },
      { status: "Primera Revisión" },
      { status: "Segunda Revisión" },
      { status: "Cotización del Viaje" },
      { status: "Atención Agencia de Viajes" },
      { status: "Comprobación gastos del viaje" },
      { status: "Validación de comprobantes" },
      { status: "Finalizado" },
      { status: "Cancelado" },
      { status: "Rechazado" },
    ],
    skipDuplicates: true,
  });
}

async function seedGlobalGeography() {
  const countries = [
    "México", "Estados Unidos", "Canadá", "Brásil", "Argentina",
    "Chile", "Colombia", "España", "Francia", "Reino Unido",
    "Alemania", "Italia", "Japón", "China", "India",
  ];
  await prisma.country.createMany({
    data: countries.map((c) => ({ countryName: c })),
    skipDuplicates: true,
  });

  const cities = [
    "CDMX", "Guadalajara", "Monterrey", "Cancún", "Mérida",
    "Nueva York", "Los Ángeles", "San Francisco", "Chicago", "Las Vegas",
    "Toronto", "Vancouver", "Rio de Janeiro", "Sao Paulo",
    "Buenos Aires", "Cordoba", "Santiago", "Valparaíso",
    "Bogotá", "Barranquilla", "Madrid", "Barcelona",
    "Paris", "Lyon", "Londres", "Manchester",
    "Berlín", "Munich", "Roma", "Venecia",
    "Tokyo", "Kyoto", "Pekín", "Hong Kong",
    "Bombay", "Nueva Delhi",
  ];
  await prisma.city.createMany({
    data: cities.map((c) => ({ cityName: c })),
    skipDuplicates: true,
  });
}

async function bootstrapDitta() {
  console.warn("Bootstrapping Ditta (ROOT org)...");

  // Org ROOT: la migration ya hizo el INSERT, pero ratificamos.
  await prisma.organization.upsert({
    where: { id: DITTA_ORG_ID },
    update: { kind: "ROOT", status: "ACTIVE", nombre: "Ditta" },
    create: {
      id: DITTA_ORG_ID,
      nombre: "Ditta",
      rfc: DITTA_RFC,
      kind: "ROOT",
      status: "ACTIVE",
    },
  });

  await bootstrapOrganizationCatalogs(prisma, DITTA_ORG_ID, { includeDittaSuperAdmin: true });

  await ensureOrganizationAdmin(prisma, DITTA_ORG_ID, {
    userName: "admin_ditta",
    email: "admin@ditta.com",
    password: DITTA_ADMIN_PASSWORD,
    roleName: "Admin Ditta",
  });

  console.warn("Ditta bootstrapped.");
}

async function main() {
  console.warn("Seeding reference data...");

  await seedGlobalPermissions();
  await seedGlobalRequestStatus();
  await seedGlobalGeography();

  await bootstrapDitta();

  if (isDev) {
    console.warn("Dev mode: Bootstrapping TechCorp and Logística client orgs...");

    const techCorp = await prisma.organization.upsert({
      where: { id: 2n },
      update: { status: "ACTIVE", kind: "CLIENT" },
      create: {
        id: 2n,
        nombre: "TechCorp México SA de CV",
        razonSocial: "TechCorp México Sociedad Anónima de Capital Variable",
        rfc: "XAXX010101000",
        kind: "CLIENT",
        status: "ACTIVE",
      },
    });

    const logistica = await prisma.organization.upsert({
      where: { id: 3n },
      update: { status: "ACTIVE", kind: "CLIENT" },
      create: {
        id: 3n,
        nombre: "Logística del Norte SA de CV",
        razonSocial: "Logística del Norte Sociedad Anónima de Capital Variable",
        rfc: "XEXX010101000",
        kind: "CLIENT",
        status: "ACTIVE",
      },
    });

    await bootstrapOrganizationCatalogs(prisma, techCorp.id, { includeDittaSuperAdmin: false });
    await bootstrapOrganizationCatalogs(prisma, logistica.id, { includeDittaSuperAdmin: false });

    // Departments dev demo per-org.
    await prisma.department.createMany({
      data: [
        { organizationId: techCorp.id,  departmentName: "Finanzas",          costsCenter: "CC001", active: true },
        { organizationId: techCorp.id,  departmentName: "Recursos Humanos",  costsCenter: "CC002", active: true },
        { organizationId: techCorp.id,  departmentName: "IT",                costsCenter: "CC003", active: true },
        { organizationId: logistica.id, departmentName: "Operaciones",       costsCenter: "CC005", active: true },
        { organizationId: logistica.id, departmentName: "Admin",             costsCenter: "ADMIN", active: true },
      ],
      skipDuplicates: true,
    });

    // Sample dev user para login simple en TechCorp.
    await ensureOrganizationAdmin(prisma, techCorp.id, {
      userName: "admin_techcorp",
      email: "admin@techcorp.test",
      password: "TechCorp!2026",
    });
    await ensureOrganizationAdmin(prisma, logistica.id, {
      userName: "admin_logistica",
      email: "admin@logistica.test",
      password: "Logistica!2026",
    });

    console.warn("Dev orgs bootstrapped.");
  }

  console.warn("Seed complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
