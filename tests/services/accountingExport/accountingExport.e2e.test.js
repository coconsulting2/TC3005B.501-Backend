/**
 * @file tests/services/accountingExport/accountingExport.e2e.test.js
 * @description End-to-end tests for M1-010 (API de exportacion contable JSON/XML).
 * Usa Postgres real via docker-compose.dev (DATABASE_URL apunta al contenedor postgres).
 *
 * Run:
 *   bun run docker:dev
 *   bun run test:e2e -- tests/services/accountingExport/accountingExport.e2e.test.js
 *
 * Cubre:
 *   - GET /api/accounts-payable/accounting-export/:request_id  (1 viaje)
 *   - GET /api/accounts-payable/accounting-export?from=&to=    (batch por rango)
 *   - Casos: con anticipo, sin anticipo, 404, 409, 403 (rol incorrecto), 400 (rango invalido),
 *            negociacion de formato JSON/XML, rango vacio, multiples viajes.
 */
import dotenv from "dotenv";
dotenv.config();

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { XMLParser } from "fast-xml-parser";

import prisma, { connectPostgres, disconnectPostgres, resetPostgres } from "../../../database/config/prisma.js";
import { createTestJWT, LOCALHOST, ROLES } from "../../utils/createTestAuthToken.js";

// IMPORTANTE: disable triggers del Prisma extension para que los UPDATEs no generen
// side-effects al sembrar (consistente con la e2e existente).
process.env.PRISMA_DISABLE_TRIGGERS = "true";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ??= "dev_jwt_secret_change_me";

/** @type {import('express').Express} */
const { default: app } = await import("../../../app.js");
app.set("trust proxy", "loopback");

const BASE = "/api/accounts-payable";
// Pin user_id to match the auth fixture seeded below so the permission
// middleware can resolve effective permissions against a real DB row.
const AUTH_USER_ID = 1001;
const authHeaders = (role = ROLES.ACCOUNTS_PAYABLE) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${createTestJWT(role, { IP: LOCALHOST, user_id: AUTH_USER_ID })}`,
    "x-forwarded-for": LOCALHOST,
});

// ──────────────────────────────────────────────────────────
// Helpers de siembra
// ──────────────────────────────────────────────────────────

async function seedCatalogs() {
    await prisma.role.createMany({
        data: [
            { roleName: "Solicitante" },
            { roleName: "Cuentas por pagar" },
            { roleName: "N1" },
        ],
        skipDuplicates: true,
    });

    await prisma.department.createMany({
        data: [{ departmentName: "Sistemas", costsCenter: "102" }],
        skipDuplicates: true,
    });

    await prisma.requestStatus.createMany({
        data: [
            { status: "Borrador" },
            { status: "Primera Revision" },
            { status: "Segunda Revision" },
            { status: "Cotizacion del Viaje" },
            { status: "Atencion Agencia de Viajes" },
            { status: "Comprobacion gastos del viaje" },
            { status: "Validacion de comprobantes" },
            { status: "Finalizado" },
            { status: "Cancelado" },
            { status: "Rechazado" },
        ],
        skipDuplicates: true,
    });

    await prisma.receiptType.createMany({
        data: [{ receiptTypeName: "Comida" }, { receiptTypeName: "Hospedaje" }],
        skipDuplicates: true,
    });

    // Minimum permission state for the granular middleware: the accounting-
    // export routes are gated on `accounting:export`. Grant it to "Cuentas por
    // pagar" and materialize the pinned auth user so loadEffectivePermissions
    // resolves to a non-empty set.
    const cppRole = await prisma.role.findFirstOrThrow({ where: { roleName: "Cuentas por pagar" } });
    const perm = await prisma.permission.upsert({
        where: { code: "accounting:export" },
        update: {},
        create: {
            code: "accounting:export",
            resource: "accounting",
            action: "export",
            description: "Export accounting data",
        },
    });
    await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: cppRole.roleId, permissionId: perm.permissionId } },
        update: {},
        create: { roleId: cppRole.roleId, permissionId: perm.permissionId },
    });
    await prisma.user.upsert({
        where: { userId: AUTH_USER_ID },
        update: { roleId: cppRole.roleId },
        create: {
            userId: AUTH_USER_ID,
            roleId: cppRole.roleId,
            userName: `e2e-auth-${AUTH_USER_ID}`,
            password: "test",
            workstation: "test",
            email: `e2e-auth-${AUTH_USER_ID}@example.com`,
        },
    });
}

async function seedUser({ userName = "Pedro Castillo", costsCenter = "102" } = {}) {
    const dept = await prisma.department.findFirst({ where: { costsCenter } });
    const role = await prisma.role.findFirst({ where: { roleName: "Solicitante" } });
    return prisma.user.create({
        data: {
            userName,
            email: `${userName.replace(/\s+/g, "").toLowerCase()}@test.local`,
            password: "x".repeat(12),
            workstation: "test-ws",
            roleId: role?.roleId,
            departmentId: dept?.departmentId,
        },
    });
}

async function seedFinalizedRequest({ userId, imposedFee = 1000 }) {
    return prisma.request.create({
        data: {
            userId,
            requestStatusId: 8, // Finalizado
            requestedFee: imposedFee || 0,
            imposedFee,
            requestDays: 3,
            notes: "e2e",
        },
    });
}

async function seedReceiptWithCfdi({ requestId, subtotal, iva, total, moneda = "MXN", tipoCambio = 1, uuid }) {
    const receiptType = await prisma.receiptType.findFirst({ where: { receiptTypeName: "Comida" } });
    const receipt = await prisma.receipt.create({
        data: {
            requestId,
            receiptTypeId: receiptType?.receiptTypeId,
            validation: "Aprobado",
            amount: total,
            validationDate: new Date("2026-04-30T12:00:00Z"),
        },
    });
    await prisma.cfdiComprobante.create({
        data: {
            receiptId: receipt.receiptId,
            uuid,
            fechaTimbrado: new Date("2026-04-29T12:00:00Z"),
            rfcPac: "PAC000101000",
            version: "4.0",
            fechaEmision: new Date("2026-04-29T12:00:00Z"),
            tipoComprobante: "I",
            lugarExpedicion: "06600",
            metodoPago: "PUE",
            formaPago: "03",
            moneda,
            tipoCambio,
            subtotal,
            iva,
            total,
            rfcEmisor: "EMI010101AAA",
            nombreEmisor: "Emisor Test",
            regimenFiscalEmisor: "601",
            rfcReceptor: "REC010101BBB",
            nombreReceptor: "Receptor Test",
            domicilioFiscalReceptor: "06600",
            regimenFiscalReceptor: "601",
            usoCfdi: "G03",
            satCodigoEstatus: "S - Comprobante obtenido satisfactoriamente",
            satEstado: "Vigente",
            satValidacionEfos: "200",
        },
    });
    return receipt;
}

// ──────────────────────────────────────────────────────────
// Suite
// ──────────────────────────────────────────────────────────

describe("[E2E] M1-010 Accounting Export API", () => {
    beforeAll(async () => {
        await connectPostgres();
    }, 30_000);

    afterAll(async () => {
        await disconnectPostgres();
    }, 30_000);

    beforeEach(async () => {
        await resetPostgres();
        await seedCatalogs();
    }, 30_000);

    // ─── 1) happy path: con anticipo (JSON) ─────────────────────────────────
    describe("GET /accounting-export/:request_id (JSON)", () => {
        it("[TC-E2E-01] viaje Finalizado con anticipo: devuelve AV + GV balanceadas", async () => {
            const user = await seedUser();
            const req = await seedFinalizedRequest({ userId: user.userId, imposedFee: 1000 });
            await seedReceiptWithCfdi({
                requestId: req.requestId, subtotal: 850, iva: 150, total: 1000,
                uuid: "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE",
            });

            const res = await request(app)
                .get(`${BASE}/accounting-export/${req.requestId}`)
                .set(authHeaders());

            expect(res.statusCode).toBe(200);
            expect(res.body.polizas).toHaveLength(2);

            const [av, gv] = res.body.polizas;
            expect(av.header.DOC_TYPE).toBe("AV");
            expect(av.header.ID_VIAJE).toBe(String(req.requestId));
            expect(av.detalles[0]).toMatchObject({ SHKZG: "S", GL_ACCOUNT: "1000" });
            expect(av.detalles[1]).toMatchObject({ SHKZG: "H", GL_ACCOUNT: "1001" });

            expect(gv.header.DOC_TYPE).toBe("GV");
            // Debe GV = subtotal + iva = 1000 = Haber 1000 (cierra contra anticipo)
            const sumDebe = gv.detalles.filter(d => d.SHKZG === "S").reduce((s, d) => s + d.AMT_DOCCUR, 0);
            const sumHaber = gv.detalles.filter(d => d.SHKZG === "H").reduce((s, d) => s + d.AMT_DOCCUR, 0);
            expect(sumDebe).toBeCloseTo(1000, 4);
            expect(sumHaber).toBeCloseTo(1000, 4);
            expect(gv.detalles.at(-1).GL_ACCOUNT).toBe("1000");
            // COSTCENTER inyectado desde User.department.costsCenter
            expect(gv.detalles.find(d => d.GL_ACCOUNT === "1002").COSTCENTER).toBe("102");
        });

        it("[TC-E2E-02] viaje Finalizado sin anticipo: devuelve solo GV con haber 1001", async () => {
            const user = await seedUser({ userName: "Camila Zapata" });
            const req = await seedFinalizedRequest({ userId: user.userId, imposedFee: 0 });
            await seedReceiptWithCfdi({
                requestId: req.requestId, subtotal: 1000, iva: 0, total: 1000,
                uuid: "BBBBBBBB-BBBB-4CCC-8DDD-EEEEEEEEEEEE",
            });

            const res = await request(app)
                .get(`${BASE}/accounting-export/${req.requestId}`)
                .set(authHeaders());

            expect(res.statusCode).toBe(200);
            expect(res.body.polizas).toHaveLength(1);
            const [gv] = res.body.polizas;
            expect(gv.header.DOC_TYPE).toBe("GV");
            expect(gv.detalles.at(-1).GL_ACCOUNT).toBe("1001");
        });

        it("[TC-E2E-03] moneda USD del CFDI se refleja en CURRENCY y EXCH_RATE", async () => {
            const user = await seedUser({ userName: "Luis Gonzalez" });
            const req = await seedFinalizedRequest({ userId: user.userId, imposedFee: 0 });
            await seedReceiptWithCfdi({
                requestId: req.requestId, subtotal: 850, iva: 150, total: 1000,
                moneda: "USD", tipoCambio: 19,
                uuid: "CCCCCCCC-BBBB-4CCC-8DDD-EEEEEEEEEEEE",
            });

            const res = await request(app)
                .get(`${BASE}/accounting-export/${req.requestId}`)
                .set(authHeaders());

            expect(res.statusCode).toBe(200);
            expect(res.body.polizas[0].header.CURRENCY).toBe("USD");
            expect(res.body.polizas[0].header.EXCH_RATE).toBe(19);
        });
    });

    // ─── 2) XML ─────────────────────────────────────────────────────────────
    describe("GET /accounting-export/:request_id (XML)", () => {
        it("[TC-E2E-04] ?format=xml responde application/xml bien formado", async () => {
            const user = await seedUser();
            const req = await seedFinalizedRequest({ userId: user.userId, imposedFee: 1000 });
            await seedReceiptWithCfdi({
                requestId: req.requestId, subtotal: 850, iva: 150, total: 1000,
                uuid: "DDDDDDDD-BBBB-4CCC-8DDD-EEEEEEEEEEEE",
            });

            const res = await request(app)
                .get(`${BASE}/accounting-export/${req.requestId}?format=xml`)
                .set(authHeaders());

            expect(res.statusCode).toBe(200);
            expect(res.headers["content-type"]).toMatch(/application\/xml/);
            expect(res.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);

            const parsed = new XMLParser({ ignoreAttributes: false }).parse(res.text);
            const polizas = Array.isArray(parsed.Polizas.Poliza) ? parsed.Polizas.Poliza : [parsed.Polizas.Poliza];
            expect(polizas).toHaveLength(2);
        });

        it("[TC-E2E-05] Accept: application/xml tambien negocia XML", async () => {
            const user = await seedUser();
            const req = await seedFinalizedRequest({ userId: user.userId, imposedFee: 0 });
            await seedReceiptWithCfdi({
                requestId: req.requestId, subtotal: 1000, iva: 0, total: 1000,
                uuid: "EEEEEEEE-BBBB-4CCC-8DDD-EEEEEEEEEEEE",
            });

            const res = await request(app)
                .get(`${BASE}/accounting-export/${req.requestId}`)
                .set({ ...authHeaders(), Accept: "application/xml" });

            expect(res.statusCode).toBe(200);
            expect(res.headers["content-type"]).toMatch(/application\/xml/);
        });
    });

    // ─── 3) Errores ──────────────────────────────────────────────────────────
    describe("GET /accounting-export/:request_id (errores)", () => {
        it("[TC-E2E-06] 404 cuando el Request no existe", async () => {
            const res = await request(app)
                .get(`${BASE}/accounting-export/99999`)
                .set(authHeaders());
            expect(res.statusCode).toBe(404);
            expect(res.body.error).toMatch(/not found/i);
        });

        it("[TC-E2E-07] 409 cuando el Request existe pero no esta Finalizado (status 1)", async () => {
            const user = await seedUser();
            const req = await prisma.request.create({
                data: { userId: user.userId, requestStatusId: 1, imposedFee: 500 },
            });
            const res = await request(app)
                .get(`${BASE}/accounting-export/${req.requestId}`)
                .set(authHeaders());
            expect(res.statusCode).toBe(409);
            expect(res.body.error).toMatch(/finalized|Finalizado/);
        });

        it("[TC-E2E-08] 403 cuando el rol no es 'Cuentas por pagar'", async () => {
            const user = await seedUser();
            const req = await seedFinalizedRequest({ userId: user.userId, imposedFee: 1000 });
            const res = await request(app)
                .get(`${BASE}/accounting-export/${req.requestId}`)
                .set(authHeaders(ROLES.SOLICITING));
            expect(res.statusCode).toBe(403);
        });

        it("[TC-E2E-09] 401 sin token", async () => {
            const res = await request(app).get(`${BASE}/accounting-export/1`);
            expect(res.statusCode).toBe(401);
        });
    });

    // ─── 4) Batch por rango ─────────────────────────────────────────────────
    describe("GET /accounting-export?from=&to= (batch)", () => {
        it("[TC-E2E-10] devuelve polizas de TODOS los Requests finalizados dentro del rango", async () => {
            const user = await seedUser();
            const r1 = await seedFinalizedRequest({ userId: user.userId, imposedFee: 500 });
            const r2 = await seedFinalizedRequest({ userId: user.userId, imposedFee: 0 });
            await seedReceiptWithCfdi({ requestId: r1.requestId, subtotal: 400, iva: 100, total: 500, uuid: "11111111-BBBB-4CCC-8DDD-EEEEEEEEEEEE" });
            await seedReceiptWithCfdi({ requestId: r2.requestId, subtotal: 800, iva: 200, total: 1000, uuid: "22222222-BBBB-4CCC-8DDD-EEEEEEEEEEEE" });

            const res = await request(app)
                .get(`${BASE}/accounting-export?from=2026-01-01&to=2026-12-31`)
                .set(authHeaders());

            expect(res.statusCode).toBe(200);
            // r1 -> AV + GV (2), r2 -> GV (1)  = 3 polizas
            expect(res.body.polizas).toHaveLength(3);
            const ids = res.body.polizas.map(p => p.header.ID_VIAJE);
            expect(ids).toContain(String(r1.requestId));
            expect(ids).toContain(String(r2.requestId));
        });

        it("[TC-E2E-11] rango sin validationDate matching devuelve lista vacia", async () => {
            const user = await seedUser();
            const req = await seedFinalizedRequest({ userId: user.userId, imposedFee: 0 });
            await seedReceiptWithCfdi({ requestId: req.requestId, subtotal: 1000, iva: 0, total: 1000, uuid: "33333333-BBBB-4CCC-8DDD-EEEEEEEEEEEE" });

            const res = await request(app)
                .get(`${BASE}/accounting-export?from=2020-01-01&to=2020-12-31`)
                .set(authHeaders());

            expect(res.statusCode).toBe(200);
            expect(res.body.polizas).toEqual([]);
        });

        it("[TC-E2E-12] 400 cuando falta 'from' o 'to'", async () => {
            const res = await request(app)
                .get(`${BASE}/accounting-export?from=2026-01-01`)
                .set(authHeaders());
            expect(res.statusCode).toBe(400);
        });

        it("[TC-E2E-13] 400 cuando 'from' > 'to'", async () => {
            const res = await request(app)
                .get(`${BASE}/accounting-export?from=2026-12-31&to=2026-01-01`)
                .set(authHeaders());
            expect(res.statusCode).toBe(400);
        });

        it("[TC-E2E-14] XML batch tambien funciona", async () => {
            const user = await seedUser();
            const req = await seedFinalizedRequest({ userId: user.userId, imposedFee: 1000 });
            await seedReceiptWithCfdi({ requestId: req.requestId, subtotal: 850, iva: 150, total: 1000, uuid: "44444444-BBBB-4CCC-8DDD-EEEEEEEEEEEE" });

            const res = await request(app)
                .get(`${BASE}/accounting-export?from=2026-01-01&to=2026-12-31&format=xml`)
                .set(authHeaders());

            expect(res.statusCode).toBe(200);
            expect(res.headers["content-type"]).toMatch(/application\/xml/);
            expect(() => new XMLParser().parse(res.text)).not.toThrow();
        });
    });
});
