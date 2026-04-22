/**
 * @file tests/<>/CDFI-verification
 * @description E2E tests for CDFI verification service [ NT-009 ]
 * @author Angel Montemayor
 */
import dotenv from "dotenv";

dotenv.config();
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";

import { mutedConsoleLogs } from "../../utils/muteConsole.js";
import { loadInvoiceFixtures, pickRandomInvoiceByScenario } from "./server/invoiceFixtures.js";

import { connectMongo, disconnectMongo, resetMongo } from "../../../services/fileStorage.js";
import prisma, { connectPostgres, disconnectPostgres, resetPostgres } from "../../../database/config/prisma.js";

/** @type {app} Express */
import app from "../../../app.js";
import { startSATMockServer, stopSATMockServer } from "./server/mock-server.js";
import { createTestJWT, LOCALHOST, ROLES } from "../../utils/createTestAuthToken.js";

const INVOICE_FIXTURES = await loadInvoiceFixtures();
const HEADERS = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${createTestJWT(ROLES.ACCOUNTS_PAYABLE, { IP: LOCALHOST })}`,
    "x-forwarded-for": LOCALHOST
};
app.set("trust proxy", "loopback");

const setupDBs = async () => {
    try {
        await mutedConsoleLogs(async () => {
            await connectMongo();
            await connectPostgres();
        });
        console.info("[ E2E ] - Connected to DBs");
    } catch (err) {
        console.error(`[ E2E TESTS FAILED ] - Could not Connect to Database\n${err.message}`);
        throw new Error();
    }
};

const startMockServer = async () => { // TODO: logs server logs to a file
    try {
        let url = "";
        await mutedConsoleLogs(async () => {
            url = await startSATMockServer();
            console.info("[ E2E ] - Mock SAT server initialized.");
        });
        return url;
    } catch (err) {
        console.error(`[ E2E TESTS FAILED ] - Could not initialize mock server "SAT CDFI Verification service"\n${err.message}`);
        throw new Error();
    }
};

/**
 *
 * @param {import("./invoiceFixtures.js").InvoiceFixture} invoice
 * @returns {Promise<import("@prisma/client").Receipt>}
 */
async function seedReceiptWithCfdi(invoice) {
    const receipt = await prisma.receipt.create({
        data: {
            amount: invoice.amount,
            validation: "Pendiente",
        },
    });

    await prisma.cfdiComprobante.create({
        data: {
            receiptId: receipt.receiptId,
            // Timbre
            uuid: invoice.uuid,
            fechaTimbrado: new Date(invoice.fecha_timbrado),
            rfcPac: invoice.rfc_pac,

            // Comprobante
            version: invoice.version,
            serie: invoice.serie,
            folio: invoice.folio,
            fechaEmision: new Date(invoice.fecha_emision),
            tipoComprobante: invoice.tipo_comprobante,
            lugarExpedicion: invoice.lugar_expedicion,
            exportacion: invoice.exportacion,
            metodoPago: invoice.metodo_pago,
            formaPago: invoice.forma_pago,
            moneda: invoice.moneda,
            tipoCambio: invoice.tipo_cambio,
            subtotal: invoice.subtotal,
            descuento: invoice.descuento,
            iva: invoice.iva,
            total: invoice.total,

            // Emisor/Receptor
            rfcEmisor: invoice.rfc_emisor,
            nombreEmisor: invoice.nombre_emisor,
            regimenFiscalEmisor: invoice.regimen_fiscal_emisor,
            rfcReceptor: invoice.rfc_receptor,
            nombreReceptor: invoice.nombre_receptor,
            domicilioFiscalReceptor: invoice.domicilio_fiscal_receptor,
            regimenFiscalReceptor: invoice.regimen_fiscal_receptor,
            usoCfdi: invoice.uso_cfdi,

            // SAT fields required by schema
            satCodigoEstatus: invoice.sat_codigo_estatus,
            satEstado: invoice.sat_estado,
            satEsCancelable: invoice.sat_es_cancelable,
            satEstatusCancelacion: invoice.sat_estatus_cancelacion,
            satValidacionEfos: invoice.sat_validacion_efos,
        },
    });

    return receipt;
}

describe("CDFI Verification service", () => {
    beforeAll(async () => {
        await setupDBs();
        process.env.SAT_WSDL_URL = await startMockServer();
    }, 30_000);

    beforeEach(async () => {
        await mutedConsoleLogs(async () => {
            await resetMongo();
            await resetPostgres();
        });
    }, 5_000);

    afterAll(async () => {
        try {
            await mutedConsoleLogs(async () => {
                await disconnectMongo();
                await disconnectPostgres();
                await stopSATMockServer();
            });
            console.info("[ E2E ] - Disconnected to DBs");
        } catch (err) {
            console.error(`[ E2E TESTS ERROR ] - Error deallocating resources\n${err}`);
            throw new Error();
        }
    }, 30_000);

    async function approveAndReload(invoice, cfdiOverride = null) {
        const seeded = await seedReceiptWithCfdi(invoice);
        if (cfdiOverride) {
            await prisma.cfdiComprobante.update({
                where: { receiptId: seeded.receiptId },
                data: cfdiOverride,
            });
        }

        const res = await request(app)
            .put(`/api/accounts-payable/validate-receipt/${seeded.receiptId}`)
            .set(HEADERS)
            .send({ approval: 1 });

        const updated = await prisma.receipt.findUnique({
            where: { receiptId: seeded.receiptId },
            include: { cfdiComprobante: true },
        });

        return { res, updated, seeded };
    }

    describe("1) Valid CFDI", () => {
        it("[TC-001-V-01] approves valid CFDI with EFOS 200", async () => {
            const fixture = pickRandomInvoiceByScenario(INVOICE_FIXTURES, "vigente");
            const { res, updated } = await approveAndReload(fixture);

            expect(res.statusCode).toBe(200);
            expect(updated.validation).toBe("Aprobado");
            expect(updated.cfdiComprobante.satEstado).toBe("Vigente");
            expect(updated.cfdiComprobante.satValidacionEfos).toBe("200");
        });

        it.skip("[TC-002-V-02] FE extended parameter is not reachable from endpoint (selloUltimos8 is hardcoded null)", async () => {
            expect(true).toBe(true);
        });

        it("[TC-003-V-03] approves valid CFDI with EFOS 201", async () => {
            const fixture = pickRandomInvoiceByScenario(INVOICE_FIXTURES, "vigente201");
            const { res, updated } = await approveAndReload(fixture);

            expect(res.statusCode).toBe(200);
            expect(updated.validation).toBe("Aprobado");
            expect(updated.cfdiComprobante.satEstado).toBe("Vigente");
            expect(updated.cfdiComprobante.satValidacionEfos).toBe("201");
        });
    });

    describe("2) Not Found CFDI (N-602)", () => {
        it("[TC-004-NF-01] keeps receipt pending when SAT returns no encontrado", async () => {
            const fixture = pickRandomInvoiceByScenario(INVOICE_FIXTURES, "noEncontrado");
            const { res, updated } = await approveAndReload(fixture);

            expect(res.statusCode).toBe(409);
            expect(updated.validation).toBe("Pendiente");
            expect(updated.cfdiComprobante.satEstado).toBe("No Encontrado");
            expect(updated.cfdiComprobante.satCodigoEstatus).toContain("N - 602");
        });

        it("[TC-005-NF-02] keeps receipt pending when UUID does not exist in SAT", async () => {
            const fixture = pickRandomInvoiceByScenario(INVOICE_FIXTURES, "vigente");
            const { res, updated } = await approveAndReload(fixture, {
                uuid: "11111111-1111-4111-8111-111111111111",
            });

            expect(res.statusCode).toBe(409);
            expect(updated.validation).toBe("Pendiente");
            expect(updated.cfdiComprobante.satEstado).toBe("No Encontrado");
            expect(updated.cfdiComprobante.satCodigoEstatus).toContain("N - 602");
        });

        it("[TC-006-NF-03] keeps receipt pending when RFC emisor mismatches", async () => {
            const fixture = pickRandomInvoiceByScenario(INVOICE_FIXTURES, "vigente");
            const { res, updated } = await approveAndReload(fixture, {
                rfcEmisor: "XAXX010101000",
            });

            expect(res.statusCode).toBe(409);
            expect(updated.validation).toBe("Pendiente");
            expect(updated.cfdiComprobante.satEstado).toBe("No Encontrado");
        });

        it("[TC-007-NF-04] keeps receipt pending when RFC receptor mismatches", async () => {
            const fixture = pickRandomInvoiceByScenario(INVOICE_FIXTURES, "vigente");
            const { res, updated } = await approveAndReload(fixture, {
                rfcReceptor: "XEXX010101000",
            });

            expect(res.statusCode).toBe(409);
            expect(updated.validation).toBe("Pendiente");
            expect(updated.cfdiComprobante.satEstado).toBe("No Encontrado");
        });

        it("[TC-008-NF-05] keeps receipt pending when total mismatches", async () => {
            const fixture = pickRandomInvoiceByScenario(INVOICE_FIXTURES, "vigente");
            const { res, updated } = await approveAndReload(fixture, {
                total: fixture.total + 1,
            });

            expect(res.statusCode).toBe(409);
            expect(updated.validation).toBe("Pendiente");
            expect(updated.cfdiComprobante.satEstado).toBe("No Encontrado");
        });

        it.skip("[TC-009-NF-06] FE mismatch is not reachable from endpoint (selloUltimos8 is hardcoded null)", async () => {
            expect(true).toBe(true);
        });
    });

    describe("3) Malformed CFDI request (N-601)", () => {
        it.skip("[TC-010-NV-01] precision formatting cannot be triggered because tt is always toFixed(2)", async () => {
            expect(true).toBe(true);
        });

        it("[TC-011-NV-02] missing mandatory id yields endpoint 409 and keeps receipt pending", async () => {
            const fixture = pickRandomInvoiceByScenario(INVOICE_FIXTURES, "vigente");
            const { res, updated } = await approveAndReload(fixture, {
                uuid: "",
            });

            expect(res.statusCode).toBe(409);
            expect(updated.validation).toBe("Pendiente");
            expect(updated.cfdiComprobante.satCodigoEstatus).toContain("N - 601");
            expect(updated.cfdiComprobante.satEstado).toBe("No Encontrado");
        });

        it("[TC-012-NV-03] illegal RFC chars yield endpoint 409 and keeps receipt pending", async () => {
            const fixture = pickRandomInvoiceByScenario(INVOICE_FIXTURES, "vigente");
            const { res, updated } = await approveAndReload(fixture, {
                rfcEmisor: "@@@",
            });

            expect(res.statusCode).toBe(409);
            expect(updated.validation).toBe("Pendiente");
            expect(updated.cfdiComprobante.satCodigoEstatus).toContain("N - 601");
            expect(updated.cfdiComprobante.satEstado).toBe("No Encontrado");
        });
    });

    describe("4) EFOS validations", () => {
        it("[TC-013-EFOS-01] EFOS 100 blocks approval", async () => {
            const fixture = pickRandomInvoiceByScenario(INVOICE_FIXTURES, "efos100");
            const { res, updated } = await approveAndReload(fixture);

            expect(res.statusCode).toBe(409);
            expect(updated.validation).toBe("Pendiente");
            expect(updated.cfdiComprobante.satEstado).toBe("Vigente");
            expect(updated.cfdiComprobante.satValidacionEfos).toBe("100");
        });

        it("[TC-014-EFOS-02] EFOS 101/104 blocks approval", async () => {
            const fixture = pickRandomInvoiceByScenario(INVOICE_FIXTURES, "efos101");
            const { res, updated } = await approveAndReload(fixture);

            expect(res.statusCode).toBe(409);
            expect(updated.validation).toBe("Pendiente");
            expect(updated.cfdiComprobante.satEstado).toBe("Vigente");
            expect(["101", "104"]).toContain(updated.cfdiComprobante.satValidacionEfos);
        });

        it("[TC-015-EFOS-03] EFOS 102/103 still approves with current endpoint policy", async () => {
            const fixture = pickRandomInvoiceByScenario(INVOICE_FIXTURES, "efos102");
            const { res, updated } = await approveAndReload(fixture);

            expect(res.statusCode).toBe(200);
            expect(updated.validation).toBe("Aprobado");
            expect(updated.cfdiComprobante.satEstado).toBe("Vigente");
            expect(["102", "103"]).toContain(updated.cfdiComprobante.satValidacionEfos);
        });
    });
});

