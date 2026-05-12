/**
 * @file prisma/seed-usability.js
 * @description Seed de datos para pruebas de usabilidad (UAT).
 *
 * Prerequisito: haber corrido `node prisma/seed.js dev` antes.
 * Crea la org CocoFuego con los mismos usuarios del fixture original,
 * asigna jerarquía manager, y precarga requests en los estados que
 * necesita cada escenario del guión del facilitador.
 *
 * Usage:  node prisma/seed-usability.js
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import {
  bootstrapOrganizationCatalogs,
} from "./seedHelpers/bootstrapOrganization.js";

dotenv.config();
const prisma = new PrismaClient();
const SALT = 10;
const PWD = "Fuego2026!";

// ── Org ──────────────────────────────────────────────────────────────
const ORG = {
  nombre: "CocoFuego",
  razonSocial: "CocoFuego Demo S.A. de C.V.",
  rfc: "COFU260101AAA",
  kind: "CLIENT",
  status: "ACTIVE",
};

// ── Departments ──────────────────────────────────────────────────────
const DEPTS = [
  { name: "Dirección",    cc: "CC-DIR-01" },
  { name: "Operaciones",  cc: "CC-OPS-01" },
  { name: "Ventas",       cc: "CC-VTA-01" },
  { name: "Contabilidad", cc: "CC-CTB-01" },
  { name: "Logística",    cc: "CC-LOG-01" },
  { name: "Marketing",    cc: "CC-MKT-01" },
  { name: "Ingeniería",   cc: "CC-ING-01" },
  { name: "Finanzas",     cc: "CC-FIN-01" },
  { name: "Desarrollo",   cc: "CC-DEV-01" },
];

// ── Users (same people as cocofuego-team.csv) ────────────────────────
// role key → resolved later via rolesByName map
const USERS = [
  // Admins
  { user: "mariano.carretero",     email: "mariano.carretero@cocofuego.mx",     role: "Administrador",       dept: "Dirección",    first: "Mariano",   last: "Carretero" },
  { user: "hector.lugo",           email: "hector.lugo@cocofuego.mx",           role: "Administrador",       dept: "Ingeniería",   first: "Hector",    last: "Lugo" },
  // N2
  { user: "kevin.esquivel",        email: "kevin.esquivel@cocofuego.mx",        role: "N2",                  dept: "Dirección",    first: "Kevin",     last: "Esquivel" },
  // N1 — jefe directo de los solicitantes
  { user: "santino.im",            email: "santino.im@cocofuego.mx",            role: "N1",                  dept: "Operaciones",  first: "Santino",   last: "Im" },
  { user: "leonardo.rodriguez",    email: "leonardo.rodriguez@cocofuego.mx",    role: "N1",                  dept: "Finanzas",     first: "Leonardo",  last: "Rodríguez" },
  // Solicitantes
  { user: "angel.montemayor",      email: "angel.montemayor@cocofuego.mx",      role: "Solicitante",         dept: "Operaciones", first: "Ángel",     last: "Montemayor" },
  { user: "emiliano.delgadillo",   email: "emiliano.delgadillo@cocofuego.mx",   role: "Solicitante",         dept: "Operaciones", first: "Emiliano",  last: "Delgadillo" },
  { user: "emiliano.deyta",        email: "emiliano.deyta@cocofuego.mx",        role: "Solicitante",         dept: "Operaciones", first: "Emiliano",  last: "Deyta" },
  // CxP
  { user: "eder.cantero",          email: "eder.cantero@cocofuego.mx",          role: "Cuentas por pagar",   dept: "Operaciones",  first: "Eder",      last: "Cantero" },
  // Agencia
  { user: "erick.morales",         email: "erick.morales@cocofuego.mx",         role: "Agencia de viajes",   dept: "Operaciones",  first: "Erick",     last: "Morales" },
];

// Manager hierarchy: solicitante → N1
const MANAGER_MAP = {
  "angel.montemayor":    "santino.im",
  "emiliano.delgadillo": "santino.im",
  "emiliano.deyta":      "leonardo.rodriguez",
};

// ── Helper: find or create country/city ──────────────────────────────
async function countryId(name) {
  const r = await prisma.country.findUnique({ where: { countryName: name } });
  return r?.countryId ?? null;
}
async function cityId(name) {
  const r = await prisma.city.findUnique({ where: { cityName: name } });
  return r?.cityId ?? null;
}

// ── Helper: create a request with a route ────────────────────────────
async function createRequest(orgId, userId, statusId, opts) {
  const {
    notes = "", requestedFee = 0, imposedFee = 0, requestDays = 3,
    originCountry = "México", originCity = "CDMX",
    destCountry = "México", destCity = "Monterrey",
    beginDate = "2026-05-20", endDate = "2026-05-23",
    planeNeeded = true, hotelNeeded = true,
    tripEndDate = null, isExported = false,
  } = opts;

  const req = await prisma.request.create({
    data: {
      organizationId: orgId,
      userId,
      requestStatusId: statusId,
      notes,
      requestedFee,
      imposedFee,
      requestDays,
      tripEndDate: tripEndDate ? new Date(tripEndDate) : null,
      isExported,
    },
  });

  const route = await prisma.route.create({
    data: {
      organizationId: orgId,
      idOriginCountry: await countryId(originCountry),
      idOriginCity: await cityId(originCity),
      idDestinationCountry: await countryId(destCountry),
      idDestinationCity: await cityId(destCity),
      routerIndex: 0,
      planeNeeded,
      hotelNeeded,
      beginningDate: new Date(beginDate),
      endingDate: new Date(endDate),
    },
  });

  await prisma.routeRequest.create({
    data: { organizationId: orgId, requestId: req.requestId, routeId: route.routeId },
  });

  return req;
}

// ── Helper: create a receipt with mock CFDI ──────────────────────────
async function createReceiptWithCfdi(orgId, requestId, receiptTypeId, opts) {
  const {
    amount = 2500, validation = "Pendiente", refund = true,
    satEstado = "Vigente", moneda = "MXN", tipoCambio = 1.0,
    emisorRfc = "AAA010101AAA", emisorNombre = "Hotel Prueba SA",
  } = opts;

  const uuid = crypto.randomUUID();

  const receipt = await prisma.receipt.create({
    data: {
      organizationId: orgId,
      requestId,
      receiptTypeId,
      amount,
      validation,
      refund,
      cfdiUuid: uuid,
      cfdiVersion: "4.0",
      cfdiEmisorRfc: emisorRfc,
      cfdiReceptorRfc: ORG.rfc,
      cfdiFecha: new Date(),
      cfdiTotal: amount,
    },
  });

  await prisma.cfdiComprobante.create({
    data: {
      organizationId: orgId,
      receiptId: receipt.receiptId,
      uuid,
      fechaTimbrado: new Date(),
      rfcPac: "SAT970701NN3",
      version: "4.0",
      serie: "A",
      folio: String(receipt.receiptId),
      fechaEmision: new Date(),
      tipoComprobante: "I",
      lugarExpedicion: "64000",
      metodoPago: "PUE",
      formaPago: "03",
      moneda,
      tipoCambio,
      subtotal: amount * 0.84,
      iva: amount * 0.16,
      total: amount,
      rfcEmisor: emisorRfc,
      nombreEmisor: emisorNombre,
      regimenFiscalEmisor: "601",
      rfcReceptor: ORG.rfc,
      nombreReceptor: ORG.razonSocial,
      domicilioFiscalReceptor: "64000",
      regimenFiscalReceptor: "601",
      usoCfdi: "G03",
      satCodigoEstatus: satEstado === "Vigente"
        ? "S - Comprobante obtenido satisfactoriamente"
        : "N - 602: Comprobante no encontrado",
      satEstado,
      satEsCancelable: "Cancelable sin aceptación",
      satEstatusCancelacion: null,
      satValidacionEfos: "200",
    },
  });

  return receipt;
}

// ═════════════════════════════════════════════════════════════════════
async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  seed-usability.js — Datos para prueba UAT  ║");
  console.log("╚══════════════════════════════════════════════╝");

  // ── 1. Crear org CocoFuego ─────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { id: 99n },
    update: { nombre: ORG.nombre, status: "ACTIVE" },
    create: {
      id: 99n,
      nombre: ORG.nombre,
      razonSocial: ORG.razonSocial,
      rfc: ORG.rfc,
      kind: "CLIENT",
      status: "ACTIVE",
    },
  });
  const orgId = org.id;
  console.log(`  ✓ Org "${ORG.nombre}" id=${orgId}`);

  // ── 2. Bootstrap catálogos (roles, permisos, receipt types, etc.)
  const { rolesByName } = await bootstrapOrganizationCatalogs(prisma, orgId);
  console.log(`  ✓ Catálogos bootstrapped (${rolesByName.size} roles)`);

  // ── 3. Departments ─────────────────────────────────────────────
  const deptMap = {};
  for (const d of DEPTS) {
    const dept = await prisma.department.upsert({
      where: { organizationId_departmentName: { organizationId: orgId, departmentName: d.name } },
      update: { costsCenter: d.cc, active: true },
      create: { organizationId: orgId, departmentName: d.name, costsCenter: d.cc },
    });
    deptMap[d.name] = dept.departmentId;
  }
  console.log(`  ✓ ${DEPTS.length} departamentos`);

  // ── 4. Users ───────────────────────────────────────────────────
  const hash = await bcrypt.hash(PWD, SALT);
  const userMap = {}; // userName → userId

  for (const u of USERS) {
    const roleId = rolesByName.get(u.role);
    if (!roleId) throw new Error(`Role "${u.role}" not found for org ${orgId}`);
    const created = await prisma.user.upsert({
      where: { userName: u.user },
      update: { organizationId: orgId, roleId, departmentId: deptMap[u.dept], active: true },
      create: {
        organizationId: orgId,
        roleId,
        departmentId: deptMap[u.dept],
        userName: u.user,
        password: hash,
        workstation: u.dept.slice(0, 12),
        email: u.email,
        active: true,
        wallet: 0,
      },
    });
    userMap[u.user] = created.userId;
  }
  console.log(`  ✓ ${USERS.length} usuarios (pwd: ${PWD})`);

  // ── 5. Manager hierarchy ───────────────────────────────────────
  for (const [sub, mgr] of Object.entries(MANAGER_MAP)) {
    if (userMap[sub] && userMap[mgr]) {
      await prisma.user.update({
        where: { userId: userMap[sub] },
        data: { managerUserId: userMap[mgr] },
      });
    }
  }
  console.log("  ✓ Jerarquía manager → solicitante");

  // ── 6. Workflow rules (pre/post aprobación) ────────────────────
  await prisma.workflowRule.deleteMany({ where: { organizationId: orgId } });
  await prisma.workflowRule.createMany({
    data: [
      {
        organizationId: orgId,
        ruleType: "pre",
        paramType: "importe",
        threshold: 50000,
        approvalLevel: 1,
        priority: 10,
        active: true,
      },
      {
        organizationId: orgId,
        ruleType: "pre",
        paramType: "importe",
        threshold: 999999999,
        approvalLevel: 2,
        priority: 20,
        active: true,
      },
      {
        organizationId: orgId,
        ruleType: "pre",
        paramType: "importe",
        threshold: 999999999,
        approvalLevel: 2,
        skipIfBelow: 50000,
        priority: 5,
        active: true,
      },
    ],
  });
  console.log("  ✓ Workflow rules (N1 ≤ $50k, N2 > $50k)");

  // ── 7. Receipt types lookup ────────────────────────────────────
  const receiptTypes = await prisma.receiptType.findMany({ where: { organizationId: orgId } });
  const rtMap = {};
  for (const rt of receiptTypes) rtMap[rt.receiptTypeName] = rt.receiptTypeId;

  // ── 8. Get user IDs for request owners ─────────────────────────
  const solicitanteId = userMap["angel.montemayor"];
  const n1Id          = userMap["santino.im"];

  // Wallet — solicitante starts with $5,000
  await prisma.user.update({ where: { userId: solicitanteId }, data: { wallet: 5000 } });
  console.log("  ✓ Wallet solicitante = $5,000");

  // ═══════════════════════════════════════════════════════════════
  // REQUESTS — uno por cada escenario del guión del facilitador
  // ═══════════════════════════════════════════════════════════════

  // ── R1: Solicitud en "Primera Revisión" (status 2) — para que N1 APRUEBE
  //    Guión Rol 2, Escenario 1: "Ana Martínez pidió viaje a Monterrey"
  const r1 = await createRequest(orgId, solicitanteId, 2, {
    notes: "Viaje de negocios a Monterrey — reuniones con cliente Cemex",
    requestedFee: 15000, imposedFee: 0, requestDays: 3,
    destCity: "Monterrey", beginDate: "2026-05-26", endDate: "2026-05-29",
  });
  console.log(`  ✓ R1 (id=${r1.requestId}) status=2 → N1 aprueba`);

  // ── R2: Solicitud en "Primera Revisión" (status 2) — para que N1 RECHACE
  //    Guión Rol 2, Escenario 2: "Carlos López pidió Cancún" — rechazar con comentario
  const r2User = userMap["emiliano.delgadillo"];
  const r2 = await createRequest(orgId, r2User, 2, {
    notes: "Viaje recreativo a Cancún — team building equipo marketing",
    requestedFee: 45000, imposedFee: 0, requestDays: 5,
    destCity: "Cancún", beginDate: "2026-06-15", endDate: "2026-06-20",
  });
  console.log(`  ✓ R2 (id=${r2.requestId}) status=2 → N1 rechaza`);

  // ── R3: Solicitud en "Atención Agencia de Viajes" (status 5) — para Agencia
  //    Guión Rol 4, Escenario 1: "Luis Ramírez" necesita vuelo + hotel
  const r3User = userMap["emiliano.deyta"];
  const r3 = await createRequest(orgId, r3User, 5, {
    notes: "Viaje a Guadalajara — conferencia de tecnología",
    requestedFee: 22000, imposedFee: 22000, requestDays: 4,
    destCity: "Guadalajara", beginDate: "2026-06-01", endDate: "2026-06-05",
    planeNeeded: true, hotelNeeded: true,
  });
  console.log(`  ✓ R3 (id=${r3.requestId}) status=5 → Agencia reserva`);

  // ── R4: Solicitud CANCELADA (status 9) — Agencia ve cancelación
  //    Guión Rol 4, Escenario 2
  const r4 = await createRequest(orgId, r2User, 9, {
    notes: "CANCELADO — Viaje a Mérida cancelado por presupuesto",
    requestedFee: 18000, imposedFee: 0, requestDays: 3,
    destCity: "Mérida", beginDate: "2026-05-10", endDate: "2026-05-13",
  });
  console.log(`  ✓ R4 (id=${r4.requestId}) status=9 → Agencia ve cancelada`);

  // ── R5: Solicitud en "Comprobación gastos del viaje" (status 6) — Solicitante sube comprobantes
  //    Guión Rol 1, Escenario 3: viaje ya terminó, debe subir gastos
  const r5 = await createRequest(orgId, solicitanteId, 6, {
    notes: "Viaje a Guadalajara completado — pendiente de comprobación",
    requestedFee: 20000, imposedFee: 20000, requestDays: 4,
    destCity: "Guadalajara", beginDate: "2026-04-28", endDate: "2026-05-02",
    tripEndDate: "2026-05-02",
  });
  console.log(`  ✓ R5 (id=${r5.requestId}) status=6 → Solicitante sube comprobantes`);

  // ── R6: Solicitud en "Validación de comprobantes" (status 7) — CxP valida
  //    Guión Rol 3, Escenario 1: CxP revisa comprobantes, uno cancelado en SAT
  const r6 = await createRequest(orgId, solicitanteId, 7, {
    notes: "Viaje a Monterrey — comprobantes listos para validación fiscal",
    requestedFee: 25000, imposedFee: 25000, requestDays: 3,
    destCity: "Monterrey", beginDate: "2026-04-20", endDate: "2026-04-23",
    tripEndDate: "2026-04-23",
  });

  // Receipts con CFDI para R6
  await createReceiptWithCfdi(orgId, r6.requestId, rtMap["Hospedaje"], {
    amount: 8500, satEstado: "Vigente", emisorNombre: "Hotel Fiesta Americana MTY",
  });
  await createReceiptWithCfdi(orgId, r6.requestId, rtMap["Comida"], {
    amount: 2800, satEstado: "Vigente", emisorNombre: "Restaurante La Nacional",
  });
  await createReceiptWithCfdi(orgId, r6.requestId, rtMap["Transporte"], {
    amount: 1200, satEstado: "Vigente", emisorNombre: "Uber Transporte MX",
  });
  // ¡Este tiene CFDI CANCELADO! — para que CxP lo detecte
  await createReceiptWithCfdi(orgId, r6.requestId, rtMap["Vuelo"], {
    amount: 6500, satEstado: "Cancelado", emisorNombre: "Volaris SAB de CV",
  });
  // Uno en USD (moneda extranjera)
  await createReceiptWithCfdi(orgId, r6.requestId, rtMap["Comida"], {
    amount: 45, satEstado: "Vigente", moneda: "USD", tipoCambio: 17.25,
    emisorRfc: "XEXX010101000", emisorNombre: "Airport Lounge Services Inc",
  });
  console.log(`  ✓ R6 (id=${r6.requestId}) status=7 + 5 receipts (1 cancelado SAT, 1 USD)`);

  // ── R7: Solicitud FINALIZADA (status 8) — para reporte gasto por CC y wallet
  //    Guión Rol 2 E3 + Rol 1 E4 + Rol 3 E4
  const r7 = await createRequest(orgId, solicitanteId, 8, {
    notes: "Viaje a CDMX — finalizado y liquidado",
    requestedFee: 12000, imposedFee: 11500, requestDays: 2,
    originCity: "Monterrey", destCity: "CDMX",
    beginDate: "2026-03-15", endDate: "2026-03-17",
    tripEndDate: "2026-03-17", isExported: false,
  });
  // Receipts aprobados para el request finalizado
  await createReceiptWithCfdi(orgId, r7.requestId, rtMap["Hospedaje"], {
    amount: 4200, validation: "Aprobado", satEstado: "Vigente",
    emisorNombre: "Hotel Presidente CDMX",
  });
  await createReceiptWithCfdi(orgId, r7.requestId, rtMap["Comida"], {
    amount: 1800, validation: "Aprobado", satEstado: "Vigente",
    emisorNombre: "Restaurante Pujol",
  });
  await createReceiptWithCfdi(orgId, r7.requestId, rtMap["Vuelo"], {
    amount: 5500, validation: "Aprobado", satEstado: "Vigente",
    emisorNombre: "Aeroméxico SA de CV",
  });
  console.log(`  ✓ R7 (id=${r7.requestId}) status=8 finalizado + 3 receipts aprobados`);

  // ── R8: Otra finalizada (más historial para reportes)
  const r8 = await createRequest(orgId, r2User, 8, {
    notes: "Viaje a Querétaro — evento de capacitación",
    requestedFee: 8000, imposedFee: 7500, requestDays: 2,
    destCity: "CDMX", beginDate: "2026-02-10", endDate: "2026-02-12",
    tripEndDate: "2026-02-12", isExported: false,
  });
  await createReceiptWithCfdi(orgId, r8.requestId, rtMap["Hospedaje"], {
    amount: 3500, validation: "Aprobado", satEstado: "Vigente",
    emisorNombre: "Holiday Inn Express QRO",
  });
  await createReceiptWithCfdi(orgId, r8.requestId, rtMap["Transporte"], {
    amount: 2200, validation: "Aprobado", satEstado: "Vigente",
    emisorNombre: "ADO Autobuses",
  });
  console.log(`  ✓ R8 (id=${r8.requestId}) status=8 finalizado (historial)`);

  // ═══════════════════════════════════════════════════════════════
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  CREDENCIALES PARA LA PRUEBA DE USABILIDAD                  ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  Contraseña común: Fuego2026!                               ║");
  console.log("╠────────────────────────────────────────────────────────────  ╣");
  console.log(`║  Solicitante:  angel.montemayor        (id=${String(userMap["angel.montemayor"]).padEnd(4)})       ║`);
  console.log(`║  N1 (Jefe):    santino.im               (id=${String(userMap["santino.im"]).padEnd(4)})       ║`);
  console.log(`║  CxP:          eder.cantero             (id=${String(userMap["eder.cantero"]).padEnd(4)})       ║`);
  console.log(`║  Agencia:      erick.morales            (id=${String(userMap["erick.morales"]).padEnd(4)})       ║`);
  console.log("╠────────────────────────────────────────────────────────────  ╣");
  console.log("║  REQUESTS PRE-CARGADAS                                      ║");
  console.log(`║  R1=${r1.requestId} (status 2) N1 aprueba                              ║`);
  console.log(`║  R2=${r2.requestId} (status 2) N1 rechaza con comentario               ║`);
  console.log(`║  R3=${r3.requestId} (status 5) Agencia reserva vuelo+hotel             ║`);
  console.log(`║  R4=${r4.requestId} (status 9) Agencia ve cancelación                  ║`);
  console.log(`║  R5=${r5.requestId} (status 6) Solicitante sube comprobantes           ║`);
  console.log(`║  R6=${r6.requestId} (status 7) CxP valida (1 CFDI cancelado, 1 USD)    ║`);
  console.log(`║  R7=${r7.requestId} (status 8) Finalizado (reportes, wallet, export)   ║`);
  console.log(`║  R8=${r8.requestId} (status 8) Finalizado (historial extra)            ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
