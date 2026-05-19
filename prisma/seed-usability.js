/**
 * @file prisma/seed-usability.js
 * @description Tenant **CocoUAT** (id fijo 101): datos completos para **pruebas de
 *   usabilidad** — mismos roles/jerarquía/solicitudes del guión del facilitador.
 *
 * **Org distinta al fixture de import:** `prisma/fixtures/cocoPruebas-team.*` define
 * **CocoPruebas** + usuarios `pruebas.*` para E2E de arrastre de archivo en front;
 * no los inserta este script. Aquí los logins del guión conservan nombres conocidos
 * (`angel.montemayor`, …) con correo `@uat.cocoscheme.local` para no colisionar
 * en el índice único global de `email`.
 *
 * Nota de visibilidad de bandeja N1/N2:
 *   La bandeja de aprobación se resuelve por el snapshot del workflow
 *   (`workflow_pre_snapshot.n1UserId` / `n2UserId`) que produce el motor de
 *   reglas a partir de `MANAGER_MAP` + reglas activas. El `dept` aquí es
 *   un atributo organizacional/reportes y se usa para reglas scoped por
 *   `departmentId`; no determina por sí mismo a quién le aparece la
 *   solicitud en la bandeja.
 *
 * Prerequisito: `node prisma/seed.js dev` (catálogo global).
 *
 * Usage:  node prisma/seed-usability.js
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  bootstrapOrganizationCatalogs,
} from "./seedHelpers/bootstrapOrganization.js";
import { buildRequestWorkflowSnapshots } from "../services/buildRequestWorkflowSnapshots.js";
import { connectMongo, disconnectMongo, uploadFile } from "../services/fileStorage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "..", "tests");
const FIXTURE_XML_RESTAURANT = path.join(
  FIXTURE_DIR,
  "services/CDFI/tax_invoices(CFDIs)/CFDI-v40-restaurant.xml",
);
const FIXTURE_XML_HOTEL = path.join(
  FIXTURE_DIR,
  "services/CDFI/tax_invoices(CFDIs)/CFDI-v33-hotel.xml",
);
const FIXTURE_PDF = path.join(FIXTURE_DIR, "fixtures/storage/valid.pdf");

dotenv.config();
const prisma = new PrismaClient();
const SALT = 10;
/** Contraseña común del guión de usabilidad (tenant CocoUAT). */
const PWD = "Fuego2026!";

// ── Org UAT (no es CocoPruebas del CSV de import) ───────────────────
const ORG = {
  nombre: "CocoUAT",
  razonSocial: "CocoUAT — datos guión facilitador (seed Docker)",
  rfc: "COUA260101AAA",
  kind: "CLIENT",
  status: "ACTIVE",
};

const DEPTS = [
  { name: "Dirección",    cc: "UAT-DIR-01" },
  { name: "Operaciones",  cc: "UAT-OPS-01" },
  { name: "Ventas",       cc: "UAT-VTA-01" },
  { name: "Contabilidad", cc: "UAT-CTB-01" },
  { name: "Logística",    cc: "UAT-LOG-01" },
  { name: "Marketing",    cc: "UAT-MKT-01" },
  { name: "Ingeniería",   cc: "UAT-ING-01" },
  { name: "Finanzas",     cc: "UAT-FIN-01" },
  { name: "Desarrollo",   cc: "UAT-DEV-01" },
];

/** Mismos userName que el guión; email único global vía dominio de seed. */
const emailUat = (userName) => `${userName}@uat.cocoscheme.local`;

const USERS = [
  { user: "mariano.carretero",     role: "Administrador",     dept: "Dirección",    first: "Mariano",   last: "Carretero" },
  { user: "hector.lugo",           role: "Administrador",     dept: "Ingeniería",   first: "Hector",    last: "Lugo" },
  { user: "kevin.esquivel",        role: "N2",                dept: "Dirección",    first: "Kevin",     last: "Esquivel" },
  { user: "santino.im",            role: "N1",                dept: "Operaciones",  first: "Santino",   last: "Im" },
  { user: "leonardo.rodriguez",    role: "N1",                dept: "Finanzas",     first: "Leonardo",  last: "Rodríguez" },
  { user: "angel.montemayor",      role: "Solicitante",       dept: "Operaciones",  first: "Ángel",     last: "Montemayor" },
  { user: "emiliano.delgadillo",   role: "Solicitante",       dept: "Operaciones",  first: "Emiliano",  last: "Delgadillo" },
  { user: "emiliano.deyta",        role: "Solicitante",       dept: "Operaciones",  first: "Emiliano",  last: "Deyta" },
  { user: "eder.cantero",          role: "Cuentas por pagar", dept: "Operaciones",  first: "Eder",      last: "Cantero" },
  { user: "erick.morales",         role: "Agencia de viajes", dept: "Operaciones",  first: "Erick",     last: "Morales" },
].map((u) => ({ ...u, email: emailUat(u.user) }));

/**
 * Cadena jerárquica de aprobación (funcional, NO basada en departamento):
 *   angel.montemayor    → santino.im → kevin.esquivel  (cluster Operaciones+Dirección)
 *   emiliano.delgadillo → santino.im → kevin.esquivel  (mismo cluster)
 *   emiliano.deyta      → leonardo.rodriguez            (cluster Finanzas)
 *
 * El motor de workflow (`services/workflowRulesEngine.js`) usa esto al
 * resolver `n1UserId` / `n2UserId` del snapshot — por eso Kevin puede
 * aprobar solicitudes de Operaciones aunque pertenezca a Dirección.
 */
const MANAGER_MAP = {
  "angel.montemayor":    "santino.im",
  "santino.im":          "kevin.esquivel",
  "emiliano.delgadillo": "santino.im",
  "emiliano.deyta":      "leonardo.rodriguez",
};

/** Fechas YYYY-MM-DD relativas al día del seed (evita plazos vencidos tras semanas). */
function buildUsabilityDates() {
  const base = new Date();
  const add = (days) => {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  return {
    /** R1 — N1 aprueba (viaje próxima semana) */
    r1Begin: add(7),
    r1End: add(10),
    /** R2 — N1 rechaza Cancún */
    r2Begin: add(28),
    r2End: add(33),
    /** R3 — Agencia cotiza (CDMX, guión agencia) */
    r3Begin: add(10),
    r3End: add(13),
    /** R4 — Cancelada (pasado) */
    r4Begin: add(-25),
    r4End: add(-22),
    /** R5 — Solicitante sube comprobantes (viaje recién terminado) */
    r5Begin: add(-12),
    r5End: add(-8),
    r5TripEnd: add(-8),
    /** R6 — CxP valida comprobantes (fin de viaje hace pocos días) */
    r6Begin: add(-18),
    r6End: add(-15),
    r6TripEnd: add(-15),
    /** R7/R8 — Historial finalizado */
    r7Begin: add(-45),
    r7End: add(-43),
    r7TripEnd: add(-43),
    r8Begin: add(-70),
    r8End: add(-68),
    r8TripEnd: add(-68),
  };
}

async function countryId(name) {
  const r = await prisma.country.findUnique({ where: { countryName: name } });
  return r?.countryId ?? null;
}
async function cityId(name) {
  const r = await prisma.city.findUnique({ where: { cityName: name } });
  return r?.cityId ?? null;
}

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

/**
 * Snapshots pre/post para bandeja N1/N2 (workflow_pre_snapshot).
 */
async function attachWorkflowSnapshots(orgId, requestId, userId, departmentId, requestedFee, destCountryId) {
  const { pre, post } = await buildRequestWorkflowSnapshots(prisma, {
    userId,
    organizationId: orgId,
    departmentId,
    requestedFee,
    destinationCountryIds: destCountryId ? [destCountryId] : [],
    currency: "MXN",
  });
  await prisma.request.update({
    where: { requestId },
    data: {
      workflowPreSnapshot: pre ?? undefined,
      workflowPostSnapshot: post ?? undefined,
    },
  });
}

/**
 * Sube XML/PDF de fixtures a GridFS para que CxP pueda abrir archivos en la UI.
 */
async function attachGridFsToReceipt(orgId, receiptId, { xmlPath, pdfPath, baseName }) {
  if (!fs.existsSync(xmlPath) || !fs.existsSync(pdfPath)) {
    console.warn(`  ⚠ Fixtures no encontrados para receipt ${receiptId}; omitiendo archivos.`);
    return;
  }
  try {
    await connectMongo();
    const xmlBuf = fs.readFileSync(xmlPath);
    const pdfBuf = fs.readFileSync(pdfPath);
    const xmlName = `${baseName}.xml`;
    const pdfName = `${baseName}.pdf`;
    const xml = await uploadFile(xmlBuf, xmlName, "application/xml", {
      organizationId: String(orgId),
      receiptId,
    });
    const pdf = await uploadFile(pdfBuf, pdfName, "application/pdf", {
      organizationId: String(orgId),
      receiptId,
    });
    await prisma.receipt.update({
      where: { receiptId },
      data: {
        xmlFileId: xml.fileId,
        xmlFileName: xmlName,
        pdfFileId: pdf.fileId,
        pdfFileName: pdfName,
      },
    });
  } catch (err) {
    console.warn(`  ⚠ GridFS no disponible (¿Mongo en docker?): ${err?.message || err}`);
  } finally {
    await disconnectMongo().catch(() => {});
  }
}

async function resetOrgTravelData(orgId) {
  const requests = await prisma.request.findMany({
    where: { organizationId: orgId },
    select: { requestId: true },
  });
  const requestIds = requests.map((r) => r.requestId);
  if (!requestIds.length) return;

  const links = await prisma.routeRequest.findMany({
    where: { organizationId: orgId },
    select: { routeId: true },
  });
  const routeIds = [...new Set(links.map((l) => l.routeId))];

  const receipts = await prisma.receipt.findMany({
    where: { requestId: { in: requestIds } },
    select: { receiptId: true },
  });
  const receiptIds = receipts.map((r) => r.receiptId);

  if (receiptIds.length) {
    await prisma.cfdiComprobante.deleteMany({
      where: { receiptId: { in: receiptIds } },
    });
    await prisma.gastoTramo.deleteMany({
      where: { receiptId: { in: receiptIds } },
    });
    await prisma.policyException.updateMany({
      where: { receiptId: { in: receiptIds } },
      data: { receiptId: null },
    });
  }

  await prisma.anticipoPolizaSnapshot.deleteMany({
    where: { requestId: { in: requestIds } },
  });
  await prisma.accountingPoliza.deleteMany({
    where: { requestId: { in: requestIds } },
  });
  await prisma.solicitudHistorial.deleteMany({
    where: { requestId: { in: requestIds } },
  });
  await prisma.alert.deleteMany({
    where: { requestId: { in: requestIds } },
  });
  await prisma.requestComment.deleteMany({
    where: { requestId: { in: requestIds } },
  });
  await prisma.policyException.deleteMany({
    where: { requestId: { in: requestIds } },
  });

  await prisma.receipt.deleteMany({ where: { requestId: { in: requestIds } } });
  await prisma.routeRequest.deleteMany({ where: { organizationId: orgId } });
  await prisma.request.deleteMany({ where: { organizationId: orgId } });
  if (routeIds.length) {
    await prisma.route.deleteMany({ where: { routeId: { in: routeIds } } });
  }
}

async function createReceiptWithCfdi(orgId, requestId, receiptTypeId, opts) {
  const {
    amount = 2500, validation = "Pendiente", refund = true,
    satEstado = "Vigente", moneda = "MXN", tipoCambio = 1.0,
    emisorRfc = "AAA010101AAA", emisorNombre = "Hotel Prueba SA",
    gridFs = null,
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

  if (gridFs) {
    await attachGridFsToReceipt(orgId, receipt.receiptId, gridFs);
  }

  return receipt;
}

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  seed-usability.js — CocoUAT (guión UAT)    ║");
  console.log("╚══════════════════════════════════════════════╝");

  const org = await prisma.organization.upsert({
    where: { id: 101n },
    update: { nombre: ORG.nombre, razonSocial: ORG.razonSocial, rfc: ORG.rfc, status: "ACTIVE" },
    create: {
      id: 101n,
      nombre: ORG.nombre,
      razonSocial: ORG.razonSocial,
      rfc: ORG.rfc,
      kind: "CLIENT",
      status: "ACTIVE",
    },
  });
  const orgId = org.id;
  console.log(`  ✓ Org "${ORG.nombre}" id=${orgId} (fixture import E2E: CocoPruebas → CSV/JSON)`);

  const { rolesByName } = await bootstrapOrganizationCatalogs(prisma, orgId);
  console.log(`  ✓ Catálogos bootstrapped (${rolesByName.size} roles)`);

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

  const hash = await bcrypt.hash(PWD, SALT);
  const userMap = {};

  for (const u of USERS) {
    const roleId = rolesByName.get(u.role);
    if (!roleId) throw new Error(`Role "${u.role}" not found for org ${orgId}`);
    const created = await prisma.user.upsert({
      where: {
        organizationId_userName: {
          organizationId: orgId,
          userName: u.user,
        },
      },
      update: {
        organizationId: orgId,
        roleId,
        departmentId: deptMap[u.dept],
        active: true,
        email: u.email,
      },
      create: {
        organizationId: orgId,
        roleId,
        departmentId: deptMap[u.dept],
        userName: u.user,
        password: hash,
        workstation: u.dept.slice(0, 20),
        email: u.email,
        active: true,
        wallet: 0,
      },
    });
    userMap[u.user] = created.userId;
  }
  console.log(`  ✓ ${USERS.length} usuarios (pwd: ${PWD})`);

  for (const [sub, mgr] of Object.entries(MANAGER_MAP)) {
    if (userMap[sub] && userMap[mgr]) {
      await prisma.user.update({
        where: { userId: userMap[sub] },
        data: { managerUserId: userMap[mgr] },
      });
    }
  }
  console.log("  ✓ Jerarquía manager → solicitante");

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

  await prisma.reimbursementTimeLimit.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      daysAfterTrip: 90,
      graceDays: 30,
      blockOnExpiry: true,
      active: true,
    },
    update: { daysAfterTrip: 90, graceDays: 30, active: true },
  });
  console.log("  ✓ Plazo comprobación UAT: 90 días + 30 gracia");

  const D = buildUsabilityDates();
  console.log(`  ✓ Fechas relativas (hoy=${new Date().toISOString().slice(0, 10)})`);

  await resetOrgTravelData(orgId);
  console.log("  ✓ Solicitudes anteriores de CocoUAT eliminadas (re-seed idempotente)");

  const receiptTypes = await prisma.receiptType.findMany({ where: { organizationId: orgId } });
  const rtMap = {};
  for (const rt of receiptTypes) rtMap[rt.receiptTypeName] = rt.receiptTypeId;

  const solicitanteId = userMap["angel.montemayor"];
  const solicitanteDept = deptMap["Operaciones"];
  const mexicoId = await countryId("México");
  await prisma.user.update({ where: { userId: solicitanteId }, data: { wallet: 5000 } });
  console.log("  ✓ Wallet solicitante = $5,000");

  const r1 = await createRequest(orgId, solicitanteId, 2, {
    notes: "Viaje de negocios a Monterrey — reuniones con cliente (guión: Ángel / Ana)",
    requestedFee: 15000, imposedFee: 0, requestDays: 3,
    destCity: "Monterrey", beginDate: D.r1Begin, endDate: D.r1End,
  });
  await attachWorkflowSnapshots(orgId, r1.requestId, solicitanteId, solicitanteDept, 15000, mexicoId);
  console.log(`  ✓ R1 (id=${r1.requestId}) status=2 → N1 aprueba (${D.r1Begin}–${D.r1End})`);

  const r2User = userMap["emiliano.delgadillo"];
  const r2Dept = deptMap["Operaciones"];
  const r2 = await createRequest(orgId, r2User, 2, {
    notes: "Viaje a Cancún — Carlos López (guión: N1 rechaza)",
    requestedFee: 45000, imposedFee: 0, requestDays: 5,
    destCity: "Cancún", beginDate: D.r2Begin, endDate: D.r2End,
  });
  await attachWorkflowSnapshots(orgId, r2.requestId, r2User, r2Dept, 45000, mexicoId);
  console.log(`  ✓ R2 (id=${r2.requestId}) status=2 → N1 rechaza`);

  const r3User = userMap["emiliano.delgadillo"];
  const r3 = await createRequest(orgId, r3User, 5, {
    notes: "Viaje a CDMX — Luis Ramírez (guión agencia: vuelo + hotel)",
    requestedFee: 22000, imposedFee: 22000, requestDays: 3,
    destCity: "CDMX", beginDate: D.r3Begin, endDate: D.r3End,
    planeNeeded: true, hotelNeeded: true,
  });
  await attachWorkflowSnapshots(orgId, r3.requestId, r3User, r2Dept, 22000, mexicoId);
  console.log(`  ✓ R3 (id=${r3.requestId}) status=5 → Agencia reserva (${D.r3Begin}–${D.r3End})`);

  const r4 = await createRequest(orgId, r2User, 9, {
    notes: "CANCELADO — Viaje a Mérida cancelado por presupuesto",
    requestedFee: 18000, imposedFee: 0, requestDays: 3,
    destCity: "Mérida", beginDate: D.r4Begin, endDate: D.r4End,
  });
  console.log(`  ✓ R4 (id=${r4.requestId}) status=9 → Agencia ve cancelada`);

  const r5 = await createRequest(orgId, solicitanteId, 6, {
    notes: "Viaje a Guadalajara — subir comprobantes (restaurante + taxi)",
    requestedFee: 20000, imposedFee: 20000, requestDays: 4,
    destCity: "Guadalajara", beginDate: D.r5Begin, endDate: D.r5End,
    tripEndDate: D.r5TripEnd,
  });
  console.log(`  ✓ R5 (id=${r5.requestId}) status=6 → Solicitante sube comprobantes`);

  const r6 = await createRequest(orgId, solicitanteId, 7, {
    notes: "Viaje a Monterrey — liquidación CxP (guión: Ana Martínez / Ángel)",
    requestedFee: 25000, imposedFee: 25000, requestDays: 3,
    destCity: "Monterrey", beginDate: D.r6Begin, endDate: D.r6End,
    tripEndDate: D.r6TripEnd,
  });

  await createReceiptWithCfdi(orgId, r6.requestId, rtMap["Hospedaje"], {
    amount: 8500, satEstado: "Vigente", emisorNombre: "Hotel Fiesta Americana MTY",
    gridFs: { xmlPath: FIXTURE_XML_HOTEL, pdfPath: FIXTURE_PDF, baseName: "uat-hotel-mty" },
  });
  await createReceiptWithCfdi(orgId, r6.requestId, rtMap["Comida"], {
    amount: 2800, satEstado: "Cancelado", emisorNombre: "Restaurante La Nacional",
    gridFs: { xmlPath: FIXTURE_XML_RESTAURANT, pdfPath: FIXTURE_PDF, baseName: "uat-rest-cancelado-sat" },
  });
  await createReceiptWithCfdi(orgId, r6.requestId, rtMap["Transporte"], {
    amount: 1200, satEstado: "Vigente", emisorNombre: "Uber Transporte MX",
    gridFs: { xmlPath: FIXTURE_XML_RESTAURANT, pdfPath: FIXTURE_PDF, baseName: "uat-uber-mty" },
  });
  await createReceiptWithCfdi(orgId, r6.requestId, rtMap["Vuelo"], {
    amount: 6500, satEstado: "Vigente", emisorNombre: "Volaris SAB de CV",
    gridFs: { xmlPath: FIXTURE_XML_HOTEL, pdfPath: FIXTURE_PDF, baseName: "uat-vuelo-mty" },
  });
  await createReceiptWithCfdi(orgId, r6.requestId, rtMap["Comida"], {
    amount: 45, satEstado: "Vigente", moneda: "USD", tipoCambio: 17.25,
    emisorRfc: "XEXX010101000", emisorNombre: "Airport Lounge Services Inc",
    gridFs: { xmlPath: FIXTURE_XML_RESTAURANT, pdfPath: FIXTURE_PDF, baseName: "uat-lounge-usd" },
  });
  console.log(`  ✓ R6 (id=${r6.requestId}) status=7 + 5 receipts (XML/PDF fixtures si Mongo OK)`);

  const r7 = await createRequest(orgId, solicitanteId, 8, {
    notes: "Viaje a CDMX — finalizado y liquidado",
    requestedFee: 12000, imposedFee: 11500, requestDays: 2,
    originCity: "Monterrey", destCity: "CDMX",
    beginDate: D.r7Begin, endDate: D.r7End,
    tripEndDate: D.r7TripEnd, isExported: false,
  });
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

  const r8 = await createRequest(orgId, r2User, 8, {
    notes: "Viaje a Querétaro — evento de capacitación",
    requestedFee: 8000, imposedFee: 7500, requestDays: 2,
    destCity: "CDMX", beginDate: D.r8Begin, endDate: D.r8End,
    tripEndDate: D.r8TripEnd, isExported: false,
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

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  CocoUAT — guión de usabilidad (mismo login, email seed)      ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Org id: ${String(orgId).padEnd(52)}║`);
  console.log(`║  Contraseña común: ${PWD}                               ║`);
  console.log("╠────────────────────────────────────────────────────────────  ╣");
  console.log("║  Email: {userName}@uat.cocoscheme.local (único global; login suele ser userName) ║");
  console.log(`║  Ejemplo: ${emailUat("angel.montemayor")}`);
  console.log("╠────────────────────────────────────────────────────────────  ╣");
  console.log(`║  Solicitante:  angel.montemayor   id=${userMap["angel.montemayor"]}`);
  console.log(`║  N1 (Jefe):     santino.im          id=${userMap["santino.im"]}`);
  console.log(`║  CxP:           eder.cantero        id=${userMap["eder.cantero"]}`);
  console.log(`║  Agencia:       erick.morales       id=${userMap["erick.morales"]}`);
  console.log("╠────────────────────────────────────────────────────────────  ╣");
  console.log(`║  R1=${r1.requestId} (2)  R2=${r2.requestId} (2)  R3=${r3.requestId} (5)  R4=${r4.requestId} (9)`);
  console.log(`║  R5=${r5.requestId} (6)  R6=${r6.requestId} (7)  R7=${r7.requestId} (8)  R8=${r8.requestId} (8)`);
  console.log("╠────────────────────────────────────────────────────────────  ╣");
  console.log("║  CxP: R6 tiene XML/PDF en GridFS (restaurante cancelado SAT)   ║");
  console.log("║  Subir comprobantes manual: tests/.../CFDI-v40-restaurant.xml   ║");
  console.log("║                        + tests/fixtures/storage/valid.pdf      ║");
  console.log("╠────────────────────────────────────────────────────────────  ╣");
  console.log("║  Re-ejecutar: node prisma/seed-usability.js (fechas = hoy+N)    ║");
  console.log("║  Import E2E (otra org): cocoPruebas-team.csv / .json          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
