/**
 * @file prisma/seed.demo.js
 * @description Capa extra para demo Ditta — **no** reemplaza dummy_db/empty_db.
 *   Ejecutar después de `seed.js dev` + `seed-usability.js` (tenant CocoUAT id=101).
 *
 * Añade lo que el guión DEMO_DITTA.md necesita y seed-usability no cubre:
 *   - R9 viaje multidestino (2 tramos) en comprobación
 *   - Comprobante internacional USD en R5
 *   - Enlaces gasto_tramo (comprobante ↔ tramo)
 *   - Historial de trazabilidad sintético en R7 (finalizado)
 *
 * Usage:
 *   bun run demo_db
 *   # o, sobre BD ya sembrada:
 *   node prisma/seed.demo.js
 */
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();
const ORG_ID = 101n;
const ORG_RFC = "COUA260101AAA";

async function countryId(name) {
  const r = await prisma.country.findUnique({ where: { countryName: name } });
  return r?.countryId ?? null;
}

async function cityId(name) {
  const r = await prisma.city.findUnique({ where: { cityName: name } });
  return r?.cityId ?? null;
}

async function findUser(userName) {
  return prisma.user.findFirst({
    where: { organizationId: ORG_ID, userName },
    select: { userId: true, departmentId: true },
  });
}

async function createReceipt(orgId, requestId, receiptTypeId, opts) {
  const {
    amount = 2500,
    validation = "Pendiente",
    satEstado = "Vigente",
    moneda = "MXN",
    tipoCambio = 1.0,
    emisorNombre = "Proveedor Demo SA",
  } = opts;
  const uuid = crypto.randomUUID();
  const receipt = await prisma.receipt.create({
    data: {
      organizationId: orgId,
      requestId,
      receiptTypeId,
      amount,
      validation,
      refund: true,
      cfdiUuid: uuid,
      cfdiVersion: "4.0",
      cfdiEmisorRfc: "AAA010101AAA",
      cfdiReceptorRfc: ORG_RFC,
      cfdiFecha: new Date(),
      cfdiTotal: amount,
      submissionDate: new Date(),
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
      rfcEmisor: moneda === "USD" ? "XEXX010101000" : "AAA010101AAA",
      nombreEmisor: emisorNombre,
      regimenFiscalEmisor: "601",
      rfcReceptor: ORG_RFC,
      nombreReceptor: "CocoUAT — datos guión facilitador",
      domicilioFiscalReceptor: "64000",
      regimenFiscalReceptor: "601",
      usoCfdi: "G03",
      satCodigoEstatus:
        satEstado === "Vigente"
          ? "S - Comprobante obtenido satisfactoriamente"
          : "N - 602: Comprobante no encontrado",
      satEstado,
      satEsCancelable: "Cancelable sin aceptación",
      satValidacionEfos: "200",
    },
  });
  return receipt;
}

async function seedMultidestino(orgId, userId, rtMap, dates) {
  const existing = await prisma.request.findFirst({
    where: { organizationId: orgId, notes: { contains: "DEMO R9 multidestino" } },
  });
  if (existing) {
    console.log(`  ℹ R9 ya existe (id=${existing.requestId}) — omitiendo`);
    return existing.requestId;
  }

  const req = await prisma.request.create({
    data: {
      organizationId: orgId,
      userId,
      requestStatusId: 6,
      notes: "DEMO R9 multidestino — CDMX → Guadalajara → Monterrey (comprobación por tramo)",
      tripName: "DEMO R9 multidestino",
      requestedFee: 28000,
      imposedFee: 28000,
      requestDays: 5,
      tripEndDate: new Date(dates.tripEnd),
    },
  });

  const tramo1 = await prisma.route.create({
    data: {
      organizationId: orgId,
      idOriginCountry: await countryId("México"),
      idOriginCity: await cityId("CDMX"),
      idDestinationCountry: await countryId("México"),
      idDestinationCity: await cityId("Guadalajara"),
      routerIndex: 0,
      planeNeeded: true,
      hotelNeeded: true,
      beginningDate: new Date(dates.begin),
      endingDate: new Date(dates.mid),
    },
  });
  const tramo2 = await prisma.route.create({
    data: {
      organizationId: orgId,
      idOriginCountry: await countryId("México"),
      idOriginCity: await cityId("Guadalajara"),
      idDestinationCountry: await countryId("México"),
      idDestinationCity: await cityId("Monterrey"),
      routerIndex: 1,
      planeNeeded: true,
      hotelNeeded: false,
      beginningDate: new Date(dates.mid),
      endingDate: new Date(dates.end),
    },
  });

  for (const route of [tramo1, tramo2]) {
    await prisma.routeRequest.create({
      data: { organizationId: orgId, requestId: req.requestId, routeId: route.routeId },
    });
  }

  const r1 = await createReceipt(orgId, req.requestId, rtMap["Hospedaje"], {
    amount: 4200,
    emisorNombre: "Hotel Demó GDL",
  });
  const r2 = await createReceipt(orgId, req.requestId, rtMap["Vuelo"], {
    amount: 5800,
    emisorNombre: "Aeroméxico GDL-MTY",
  });

  await prisma.gastoTramo.create({
    data: {
      organizationId: orgId,
      requestId: req.requestId,
      routeId: tramo1.routeId,
      receiptId: r1.receiptId,
    },
  });
  await prisma.gastoTramo.create({
    data: {
      organizationId: orgId,
      requestId: req.requestId,
      routeId: tramo2.routeId,
      receiptId: r2.receiptId,
    },
  });

  console.log(`  ✓ R9 (id=${req.requestId}) multidestino + 2 gasto_tramo`);
  return req.requestId;
}

async function seedInternationalOnR5(orgId, rtMap) {
  const r5 = await prisma.request.findFirst({
    where: { organizationId: orgId, requestStatusId: 6, notes: { contains: "Guadalajara — subir comprobantes" } },
    select: { requestId: true },
  });
  if (!r5) {
    console.warn("  ⚠ R5 no encontrada — omitiendo comprobante internacional");
    return;
  }

  const dup = await prisma.receipt.findFirst({
    where: {
      requestId: r5.requestId,
      cfdiComprobante: { moneda: "USD" },
    },
  });
  if (dup) {
    console.log(`  ℹ Comprobante USD en R5 ya existe (receipt ${dup.receiptId})`);
    return;
  }

  await createReceipt(orgId, r5.requestId, rtMap["Comida"], {
    amount: 45,
    moneda: "USD",
    tipoCambio: 17.25,
    emisorNombre: "Airport Lounge Services Inc",
  });
  console.log("  ✓ R5 + comprobante internacional USD (tipo cambio seed)");
}

async function seedHistorialR7(orgId) {
  const r7 = await prisma.request.findFirst({
    where: { organizationId: orgId, requestStatusId: 8, notes: { contains: "finalizado y liquidado" } },
    select: { requestId: true },
  });
  if (!r7) return;

  const count = await prisma.solicitudHistorial.count({
    where: { requestId: r7.requestId },
  });
  if (count > 0) {
    console.log(`  ℹ Historial R7 ya poblado (${count} eventos)`);
    return;
  }

  const angel = await findUser("angel.montemayor");
  const santino = await findUser("santino.im");
  const kevin = await findUser("kevin.esquivel");
  const eder = await findUser("eder.cantero");
  if (!angel || !santino || !kevin || !eder) return;

  const base = new Date();
  base.setUTCDate(base.getUTCDate() - 40);

  const events = [
    { userId: angel.userId, accion: "APROBADO", days: 0, comentario: "Enviada a revisión" },
    { userId: santino.userId, accion: "APROBADO", days: 1, comentario: "Aprobación N1 — dentro de política" },
    { userId: kevin.userId, accion: "APROBADO", days: 2, comentario: "Aprobación N2" },
    { userId: eder.userId, accion: "APROBADO", days: 35, comentario: "Liquidación CxP" },
  ];

  for (const ev of events) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + ev.days);
    await prisma.solicitudHistorial.create({
      data: {
        organizationId: orgId,
        requestId: r7.requestId,
        userId: ev.userId,
        accion: ev.accion,
        comentario: ev.comentario,
        createdAt: d,
      },
    });
  }
  console.log(`  ✓ R7 historial (${events.length} eventos de trazabilidad)`);
}

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  seed.demo.js — extras guión Ditta (CocoUAT) ║");
  console.log("╚══════════════════════════════════════════════╝");

  const org = await prisma.organization.findUnique({ where: { id: ORG_ID } });
  if (!org) {
    throw new Error("CocoUAT (id=101) no existe. Ejecuta: node prisma/seed.js dev && node prisma/seed-usability.js");
  }

  const angel = await findUser("angel.montemayor");
  if (!angel) throw new Error("Usuario angel.montemayor no encontrado en CocoUAT");

  const receiptTypes = await prisma.receiptType.findMany({ where: { organizationId: ORG_ID } });
  const rtMap = Object.fromEntries(receiptTypes.map((rt) => [rt.receiptTypeName, rt.receiptTypeId]));

  const base = new Date();
  const add = (days) => {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  await seedMultidestino(ORG_ID, angel.userId, rtMap, {
    begin: add(-14),
    mid: add(-11),
    end: add(-8),
    tripEnd: add(-8),
  });
  await seedInternationalOnR5(ORG_ID, rtMap);
  await seedHistorialR7(ORG_ID);

  console.log("");
  console.log("Demo seed listo. Tenant: CocoUAT (101), pwd: Fuego2026!");
  console.log("Comando completo: bun run demo_db");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
