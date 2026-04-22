/**
 * @file prisma/seed.js
 * @description Seeds the database with reference data (always) and dummy data (with "dev" arg).
 * Replaces Prepopulate.sql + Dummy.sql.
 *
 * Usage:
 *   node prisma/seed.js        # Reference data only
 *   node prisma/seed.js dev    # Reference + dummy data
 */
import { PrismaClient } from "@prisma/client";
import { parseCSV } from "../services/adminService.js";

const prisma = new PrismaClient();
const isDev = process.argv.includes("dev");

/**
 * Catálogo canónico de permisos y grupos.
 * El mapeo rol → grupo reproduce 1-a-1 el acceso actual de los 6 roles existentes.
 * Ver routes/*.js para la correspondencia completa.
 */
const PERMISSION_CATALOG = [
  // Travel requests
  { code: "travel_request:create",    resource: "travel_request", action: "create",    description: "Create travel requests" },
  { code: "travel_request:view_own",  resource: "travel_request", action: "view_own",  description: "View own travel requests" },
  { code: "travel_request:view_any",  resource: "travel_request", action: "view_any",  description: "View any travel request (read-only access)" },
  { code: "travel_request:edit_own",  resource: "travel_request", action: "edit_own",  description: "Edit own travel requests" },
  { code: "travel_request:submit",    resource: "travel_request", action: "submit",    description: "Submit draft/travel request" },
  { code: "travel_request:cancel",    resource: "travel_request", action: "cancel",    description: "Cancel travel request" },
  { code: "travel_request:authorize", resource: "travel_request", action: "authorize", description: "Approve or decline travel requests (N1/N2)" },

  // Travel agency
  { code: "travel_agent:attend", resource: "travel_agent", action: "attend", description: "Travel agency attends booking requests" },

  // Accounts payable
  { code: "accounts_payable:attend", resource: "accounts_payable", action: "attend", description: "Accounts payable attends requests" },
  { code: "accounting:export",       resource: "accounting",       action: "export", description: "Export accounting data" },

  // Receipts
  { code: "receipt:upload",     resource: "receipt", action: "upload",     description: "Upload receipts and CFDI" },
  { code: "receipt:delete_own", resource: "receipt", action: "delete_own", description: "Delete own uploaded receipts" },
  { code: "receipt:validate",   resource: "receipt", action: "validate",   description: "Validate receipts (accounts payable)" },

  // Expenses
  { code: "expense:view",   resource: "expense", action: "view",   description: "View expense validations" },
  { code: "expense:submit", resource: "expense", action: "submit", description: "Submit expense validations" },

  // Alerts
  { code: "authorizer:view_alerts", resource: "authorizer", action: "view_alerts", description: "View approval alerts" },

  // Users (self + admin management)
  { code: "user:view_self", resource: "user", action: "view_self", description: "View own profile" },
  { code: "user:list",      resource: "user", action: "list",      description: "List all users (admin)" },
  { code: "user:create",    resource: "user", action: "create",    description: "Create users (admin)" },
  { code: "user:edit",      resource: "user", action: "edit",      description: "Edit or deactivate users (admin)" },

  // Permission system (meta)
  { code: "permission:read",            resource: "permission",       action: "read",     description: "Read permission catalog" },
  { code: "permission:write",           resource: "permission",       action: "write",    description: "Create, edit or deactivate permissions" },
  { code: "permission_group:manage",    resource: "permission_group", action: "manage",   description: "Manage permission groups and their members" },
  { code: "role:manage_permissions",    resource: "role",             action: "manage_permissions", description: "Grant or revoke permissions on roles" },
  { code: "user:manage_permissions",    resource: "user",             action: "manage_permissions", description: "Grant or revoke permissions on users" },
];

const PERMISSION_GROUPS = [
  {
    groupName: "TravelRequestAuthor",
    description: "Solicitante — crea y da seguimiento a sus propias solicitudes",
    permissions: [
      "travel_request:create", "travel_request:view_own", "travel_request:view_any",
      "travel_request:edit_own", "travel_request:submit", "travel_request:cancel",
      "receipt:upload", "receipt:delete_own",
      "expense:view", "expense:submit",
      "user:view_self",
    ],
  },
  {
    groupName: "TravelRequestApprover",
    description: "Autorizadores N1/N2 — todo lo del solicitante + autorizar/rechazar",
    permissions: [
      "travel_request:create", "travel_request:view_own", "travel_request:view_any",
      "travel_request:edit_own", "travel_request:submit", "travel_request:cancel",
      "travel_request:authorize",
      "receipt:upload", "receipt:delete_own",
      "expense:view", "expense:submit",
      "authorizer:view_alerts",
      "user:view_self",
    ],
  },
  {
    groupName: "TravelAgencyOps",
    description: "Agencia de viajes — atiende solicitudes y ve detalles",
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
      "receipt:validate",
      "expense:view",
      "travel_request:view_any",
      "user:view_self",
    ],
  },
  {
    groupName: "OrgAdmin",
    description: "Administrador — gestiona usuarios, permisos, roles",
    permissions: [
      "user:list", "user:create", "user:edit",
      "permission:read", "permission:write", "permission_group:manage",
      "role:manage_permissions", "user:manage_permissions",
      "user:view_self",
    ],
  },
];

const ROLE_GROUP_ASSIGNMENTS = {
  "Solicitante":         ["TravelRequestAuthor"],
  "N1":                  ["TravelRequestApprover"],
  "N2":                  ["TravelRequestApprover"],
  "Agencia de viajes":   ["TravelAgencyOps"],
  "Cuentas por pagar":   ["AccountsPayableOps"],
  "Administrador":       ["OrgAdmin"],
};

/**
 * Idempotently seeds the permission catalog, groups, memberships,
 * and role → group assignments.
 */
async function seedPermissions() {
  console.warn("Seeding permissions catalog...");

  // 1. Permissions (upsert by unique code).
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { resource: p.resource, action: p.action, description: p.description, active: true },
      create: p,
    });
  }

  // 2. Groups (upsert by unique groupName).
  for (const g of PERMISSION_GROUPS) {
    await prisma.permissionGroup.upsert({
      where: { groupName: g.groupName },
      update: { description: g.description, active: true },
      create: { groupName: g.groupName, description: g.description },
    });
  }

  // 3. Group ↔ Permission memberships.
  for (const g of PERMISSION_GROUPS) {
    const group = await prisma.permissionGroup.findUnique({ where: { groupName: g.groupName } });
    const perms = await prisma.permission.findMany({ where: { code: { in: g.permissions } } });

    await prisma.permissionGroupItem.createMany({
      data: perms.map((p) => ({ groupId: group.groupId, permissionId: p.permissionId })),
      skipDuplicates: true,
    });
  }

  // 4. Role ↔ Group assignments.
  for (const [roleName, groupNames] of Object.entries(ROLE_GROUP_ASSIGNMENTS)) {
    const role = await prisma.role.findUnique({ where: { roleName } });
    if (!role) {
      console.warn(`Role "${roleName}" not found during permission seeding — skipping.`);
      continue;
    }
    const groups = await prisma.permissionGroup.findMany({ where: { groupName: { in: groupNames } } });
    await prisma.rolePermissionGroup.createMany({
      data: groups.map((gr) => ({ roleId: role.roleId, groupId: gr.groupId })),
      skipDuplicates: true,
    });
  }

  console.warn("Permissions catalog seeded.");
}

/**
 *
 */
async function main() {
  console.warn("Seeding reference data...");

  // Roles
  await prisma.role.createMany({
    data: [
      { roleName: "Solicitante" },
      { roleName: "Agencia de viajes" },
      { roleName: "Cuentas por pagar" },
      { roleName: "N1" },
      { roleName: "N2" },
      { roleName: "Administrador" },
    ],
    skipDuplicates: true,
  });

  // Alert Messages
  await prisma.alertMessage.createMany({
    data: [
      { messageText: "Se ha abierto una solicitud." },
      { messageText: "Se requiere tu revisión para Primera Revisión." },
      { messageText: "Se requiere tu revisión para Segunda Revisión." },
      { messageText: "La solicitud está lista para generar su cotización de viaje." },
      { messageText: "Se deben asignar los servicios del viaje para la solicitud." },
      { messageText: "Se requiere validar comprobantes de los gastos del viaje." },
      { messageText: "Los comprobantes están listos para validación." },
    ],
    skipDuplicates: true,
  });

  // Request Statuses
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

  // Receipt Types
  await prisma.receiptType.createMany({
    data: [
      { receiptTypeName: "Hospedaje" },
      { receiptTypeName: "Comida" },
      { receiptTypeName: "Transporte" },
      { receiptTypeName: "Caseta" },
      { receiptTypeName: "Autobús" },
      { receiptTypeName: "Vuelo" },
      { receiptTypeName: "Otro" },
    ],
    skipDuplicates: true,
  });

  await seedPermissions();

  console.warn("Reference data seeded.");

  if (isDev) {
    console.warn("Seeding dummy data...");

    // Departments
    await prisma.department.createMany({
      data: [
        { departmentName: "Finanzas", costsCenter: "CC001", active: true },
        { departmentName: "Recursos Humanos", costsCenter: "CC002", active: true },
        { departmentName: "IT", costsCenter: "CC003", active: true },
        { departmentName: "Marketing", costsCenter: "CC004", active: true },
        { departmentName: "Operaciones", costsCenter: "CC005", active: false },
        { departmentName: "Admin", costsCenter: "ADMIN", active: true },
      ],
      skipDuplicates: true,
    });

    // Users from CSV
    try {
      const csvResult = await parseCSV("./database/config/dummy_users.csv", true);
      console.warn("CSV users:", csvResult);
    } catch (err) {
      console.error("Error seeding CSV users:", err.message);
    }

    // Countries
    const countries = [
      "México", "Estados Unidos", "Canadá", "Brásil", "Argentina",
      "Chile", "Colombia", "España", "Francia", "Reino Unido",
      "Alemania", "Italia", "Japón", "China", "India",
    ];
    await prisma.country.createMany({
      data: countries.map((c) => ({ countryName: c })),
      skipDuplicates: true,
    });

    // Cities
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

    // Requests (user IDs reference users created from CSV)
    // Notes:
    //  - Cypress E2E depends on the existence of multiple "Primera Revisión"
    //    (requestStatusId=2) requests so that different tests (cancel, update,
    //    authorize) can each consume one without starving the others.
    //  - "Borrador" (status=1) fills out the draft view for draft-request spec.
    const requestsData = [
      { userId: 1, requestStatusId: 1, notes: "Solicito viáticos para viaje a conferencia en Barcelona.", requestedFee: 1500.00, imposedFee: null, requestDays: 3.0 },
      { userId: 1, requestStatusId: 2, notes: "Reembolso por gastos médicos durante viaje.", requestedFee: 800.00, imposedFee: null, requestDays: 1.0 },
      { userId: 1, requestStatusId: 3, notes: "Solicitud de apoyo económico para capacitación online.", requestedFee: 500.00, imposedFee: null, requestDays: 0.0 },
      { userId: 1, requestStatusId: 4, notes: "Viáticos para taller de liderazgo en Madrid.", requestedFee: 1200.00, imposedFee: null, requestDays: 2.0 },
      { userId: 1, requestStatusId: 5, notes: "Reembolso de transporte.", requestedFee: 300.00, imposedFee: 250.00, requestDays: 0.5 },
      { userId: 1, requestStatusId: 6, notes: "Apoyo para participación en congreso internacional.", requestedFee: 2000.00, imposedFee: 1800.00, requestDays: 4.0 },
      { userId: 1, requestStatusId: 7, notes: "Gastos operativos extraordinarios.", requestedFee: 650.00, imposedFee: 600.00, requestDays: 0.0 },
      { userId: 1, requestStatusId: 8, notes: "Viaje urgente por representación institucional.", requestedFee: 1750.00, imposedFee: 1500.00, requestDays: 3.5 },
      { userId: 1, requestStatusId: 9, notes: "Solicito anticipo para misión técnica en el extranjero.", requestedFee: 2200.00, imposedFee: 2000.00, requestDays: 5.0 },
      { userId: 1, requestStatusId: 10, notes: "Solicitud de viáticos por gira de supervisión.", requestedFee: 1300.00, imposedFee: 1200.00, requestDays: 2.5 },
      // Extra "Primera Revisión" requests consumed by Cypress specs
      // (cancel-request, update-request, request-state-change).
      { userId: 1, requestStatusId: 2, notes: "Solicitud adicional en primera revisión para pruebas E2E (cancel).", requestedFee: 1000.00, imposedFee: null, requestDays: 2.0 },
      { userId: 1, requestStatusId: 2, notes: "Solicitud adicional en primera revisión para pruebas E2E (update).", requestedFee: 1500.00, imposedFee: null, requestDays: 3.0 },
      { userId: 1, requestStatusId: 2, notes: "Solicitud adicional en primera revisión para pruebas E2E (authorize).", requestedFee: 900.00, imposedFee: null, requestDays: 1.5 },
    ];

    for (const r of requestsData) {
      await prisma.request.create({ data: r });
    }

    // Routes (simplified subset - first 10 routes + route_requests)
    const routesData = [
      { idOriginCountry: 1, idOriginCity: 1, idDestinationCountry: 1, idDestinationCity: 2, routerIndex: 0, planeNeeded: true, hotelNeeded: false, beginningDate: new Date("2025-05-01"), beginningTime: new Date("1970-01-01T08:00:00"), endingDate: new Date("2025-05-01"), endingTime: new Date("1970-01-01T11:00:00") },
      { idOriginCountry: 1, idOriginCity: 3, idDestinationCountry: 1, idDestinationCity: 5, routerIndex: 0, planeNeeded: true, hotelNeeded: true, beginningDate: new Date("2025-05-02"), beginningTime: new Date("1970-01-01T10:30:00"), endingDate: new Date("2025-05-02"), endingTime: new Date("1970-01-01T14:30:00") },
      { idOriginCountry: 1, idOriginCity: 2, idDestinationCountry: 1, idDestinationCity: 1, routerIndex: 0, planeNeeded: false, hotelNeeded: true, beginningDate: new Date("2025-05-03"), beginningTime: new Date("1970-01-01T12:00:00"), endingDate: new Date("2025-05-03"), endingTime: new Date("1970-01-01T15:00:00") },
      { idOriginCountry: 1, idOriginCity: 3, idDestinationCountry: 1, idDestinationCity: 2, routerIndex: 0, planeNeeded: true, hotelNeeded: false, beginningDate: new Date("2025-05-04"), beginningTime: new Date("1970-01-01T06:00:00"), endingDate: new Date("2025-05-04"), endingTime: new Date("1970-01-01T09:00:00") },
      { idOriginCountry: 1, idOriginCity: 1, idDestinationCountry: 2, idDestinationCity: 1, routerIndex: 0, planeNeeded: true, hotelNeeded: true, beginningDate: new Date("2025-05-05"), beginningTime: new Date("1970-01-01T14:00:00"), endingDate: new Date("2025-05-05"), endingTime: new Date("1970-01-01T18:00:00") },
      { idOriginCountry: 2, idOriginCity: 1, idDestinationCountry: 1, idDestinationCity: 1, routerIndex: 0, planeNeeded: false, hotelNeeded: false, beginningDate: new Date("2025-05-06"), beginningTime: new Date("1970-01-01T11:00:00"), endingDate: new Date("2025-05-06"), endingTime: new Date("1970-01-01T13:00:00") },
      { idOriginCountry: 1, idOriginCity: 1, idDestinationCountry: 8, idDestinationCity: 31, routerIndex: 0, planeNeeded: true, hotelNeeded: false, beginningDate: new Date("2025-05-07"), beginningTime: new Date("1970-01-01T09:30:00"), endingDate: new Date("2025-05-07"), endingTime: new Date("1970-01-01T12:30:00") },
      { idOriginCountry: 10, idOriginCity: 36, idDestinationCountry: 2, idDestinationCity: 7, routerIndex: 0, planeNeeded: true, hotelNeeded: true, beginningDate: new Date("2025-05-08"), beginningTime: new Date("1970-01-01T15:00:00"), endingDate: new Date("2025-05-08"), endingTime: new Date("1970-01-01T18:30:00") },
      { idOriginCountry: 1, idOriginCity: 1, idDestinationCountry: 8, idDestinationCity: 31, routerIndex: 0, planeNeeded: true, hotelNeeded: true, beginningDate: new Date("2025-05-09"), beginningTime: new Date("1970-01-01T08:00:00"), endingDate: new Date("2025-05-09"), endingTime: new Date("1970-01-01T11:15:00") },
      { idOriginCountry: 10, idOriginCity: 25, idDestinationCountry: 7, idDestinationCity: 29, routerIndex: 0, planeNeeded: true, hotelNeeded: false, beginningDate: new Date("2025-05-10"), beginningTime: new Date("1970-01-01T07:00:00"), endingDate: new Date("2025-05-10"), endingTime: new Date("1970-01-01T09:00:00") },
      // Routes for the 3 extra "Primera Revisión" requests added above.
      { idOriginCountry: 1, idOriginCity: 1, idDestinationCountry: 2, idDestinationCity: 6, routerIndex: 0, planeNeeded: true, hotelNeeded: true, beginningDate: new Date("2025-06-01"), beginningTime: new Date("1970-01-01T08:00:00"), endingDate: new Date("2025-06-05"), endingTime: new Date("1970-01-01T18:00:00") },
      { idOriginCountry: 1, idOriginCity: 1, idDestinationCountry: 8, idDestinationCity: 21, routerIndex: 0, planeNeeded: true, hotelNeeded: true, beginningDate: new Date("2025-06-10"), beginningTime: new Date("1970-01-01T09:00:00"), endingDate: new Date("2025-06-15"), endingTime: new Date("1970-01-01T19:00:00") },
      { idOriginCountry: 1, idOriginCity: 2, idDestinationCountry: 10, idDestinationCity: 25, routerIndex: 0, planeNeeded: true, hotelNeeded: false, beginningDate: new Date("2025-06-20"), beginningTime: new Date("1970-01-01T10:00:00"), endingDate: new Date("2025-06-22"), endingTime: new Date("1970-01-01T16:00:00") },
    ];

    for (let i = 0; i < routesData.length; i++) {
      const route = await prisma.route.create({ data: routesData[i] });
      await prisma.routeRequest.create({
        data: { requestId: i + 1, routeId: route.routeId },
      });
    }

    // Receipts
    const receiptsData = [
      { receiptTypeId: 4, requestId: 7, validation: "Pendiente", amount: 300.00, validationDate: new Date("2025-04-19T09:00:00") },
      { receiptTypeId: 2, requestId: 7, validation: "Aprobado", amount: 300.00, validationDate: new Date("2025-04-19T09:03:00") },
      { receiptTypeId: 3, requestId: 8, validation: "Rechazado", amount: 1000.00, validationDate: new Date("2025-04-19T18:00:00") },
      { receiptTypeId: 7, requestId: 8, validation: "Pendiente", amount: 600.00, validationDate: new Date("2025-04-19T18:00:59") },
    ];

    for (const receipt of receiptsData) {
      await prisma.receipt.create({ data: receipt });
    }

    console.warn("Dummy data seeded.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
