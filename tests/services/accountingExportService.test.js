/**
 * @file tests/services/accountingExportService.test.js
 * @description Unit tests for the accounting export service (M1-010).
 * Prisma is not loaded: the underlying model is mocked via jest.unstable_mockModule.
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import { XMLParser } from "fast-xml-parser";

process.env.NODE_ENV ??= "test";

// ──────────────────────────────────────────────────────────
// Mock del modelo ANTES del dynamic import del service (ESM ?? jest).
// ──────────────────────────────────────────────────────────
await jest.unstable_mockModule("../../models/accountingExportModel.js", () => ({
    default: {
        getRequestForExport: jest.fn(),
        getFinalizedRequestsInRange: jest.fn(),
    },
}));

const { default: AccountingExport } = await import("../../models/accountingExportModel.js");
const { default: AccountingExportService } = await import("../../services/accountingExportService.js");

// ──────────────────────────────────────────────────────────
// Helpers de fixtures (shape Prisma incluyendo relaciones)
// ──────────────────────────────────────────────────────────

const makeReceipt = (overrides = {}) => ({
    receiptId: 901,
    requestId: 222,
    validation: "Aprobado",
    amount: 1000,
    validationDate: new Date("2026-04-30T12:00:00Z"),
    receiptType: { receiptTypeName: "Comida" },
    cfdiComprobante: {
        subtotal: 850,
        iva: 150,
        total: 1000,
        moneda: "MXN",
        tipoCambio: 1,
    },
    ...overrides,
});

const makeRequest = (overrides = {}) => ({
    requestId: 222,
    userId: 5,
    imposedFee: 1000,
    requestStatusId: 8,
    user: { userId: 5, department: { costsCenter: "102" } },
    receipts: [makeReceipt()],
    ...overrides,
});

const sumDebe = (poliza) =>
    poliza.detalles.filter((d) => d.SHKZG === "S").reduce((s, d) => s + d.AMT_DOCCUR, 0);
const sumHaber = (poliza) =>
    poliza.detalles.filter((d) => d.SHKZG === "H").reduce((s, d) => s + d.AMT_DOCCUR, 0);

// ──────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────

describe("AccountingExportService.getPolizasForRequest", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("viaje con anticipo: emite AV + GV con haber a cuenta 1000", async () => {
        AccountingExport.getRequestForExport.mockResolvedValue(makeRequest());

        const polizas = await AccountingExportService.getPolizasForRequest(222);

        expect(polizas).toHaveLength(2);
        const [av, gv] = polizas;

        // AV
        expect(av.header.DOC_TYPE).toBe("AV");
        expect(av.header.ID_VIAJE).toBe("222");
        expect(av.header.HEADER_TXT).toBe("Anticipo Viaje # 222");
        expect(av.detalles).toHaveLength(2);
        expect(av.detalles[0]).toMatchObject({
            ITEMNO_ACC: 1, SHKZG: "S", GL_ACCOUNT: "1000", VENDOR_NO: "20000000005",
        });
        expect(av.detalles[1]).toMatchObject({
            ITEMNO_ACC: 2, SHKZG: "H", GL_ACCOUNT: "1001",
        });
        expect(sumDebe(av)).toBe(1000);
        expect(sumHaber(av)).toBe(1000);

        // GV (con anticipo -> haber a 1000)
        expect(gv.header.DOC_TYPE).toBe("GV");
        expect(gv.header.HEADER_TXT).toBe("Comprobacion Viaje # 222");
        const haber = gv.detalles.at(-1);
        expect(haber.GL_ACCOUNT).toBe("1000");
        expect(haber.SHKZG).toBe("H");
        expect(sumDebe(gv)).toBe(sumHaber(gv));
    });

    test("viaje SIN anticipo: solo GV con haber a 1001", async () => {
        AccountingExport.getRequestForExport.mockResolvedValue(
            makeRequest({ requestId: 223, imposedFee: 0 })
        );

        const polizas = await AccountingExportService.getPolizasForRequest(223);

        expect(polizas).toHaveLength(1);
        const [gv] = polizas;
        expect(gv.header.DOC_TYPE).toBe("GV");
        expect(gv.header.HEADER_TXT).toBe("Gasto sin Anticipo # 223");
        const haber = gv.detalles.at(-1);
        expect(haber.GL_ACCOUNT).toBe("1001");
    });

    test("imposedFee null se trata como sin anticipo", async () => {
        AccountingExport.getRequestForExport.mockResolvedValue(
            makeRequest({ imposedFee: null })
        );
        const polizas = await AccountingExportService.getPolizasForRequest(222);
        expect(polizas).toHaveLength(1);
        expect(polizas[0].detalles.at(-1).GL_ACCOUNT).toBe("1001");
    });

    test("receipt con iva=0 omite la linea 1003", async () => {
        AccountingExport.getRequestForExport.mockResolvedValue(
            makeRequest({
                imposedFee: 0,
                receipts: [
                    makeReceipt({
                        cfdiComprobante: { subtotal: 1000, iva: 0, total: 1000, moneda: "MXN", tipoCambio: 1 },
                    }),
                ],
            })
        );
        const [gv] = await AccountingExportService.getPolizasForRequest(222);
        const cuentas = gv.detalles.map((d) => d.GL_ACCOUNT);
        expect(cuentas).not.toContain("1003");
    });

    test("multi-receipt acumula totales y mantiene numeracion ITEMNO_ACC secuencial", async () => {
        AccountingExport.getRequestForExport.mockResolvedValue(
            makeRequest({
                imposedFee: 0,
                receipts: [
                    makeReceipt({ receiptId: 1, cfdiComprobante: { subtotal: 100, iva: 16, total: 116, moneda: "MXN", tipoCambio: 1 } }),
                    makeReceipt({ receiptId: 2, cfdiComprobante: { subtotal: 200, iva: 32, total: 232, moneda: "MXN", tipoCambio: 1 } }),
                ],
            })
        );
        const [gv] = await AccountingExportService.getPolizasForRequest(222);
        // 2 receipts * (Debe 1002 + Debe 1003) + 1 Haber = 5 items
        expect(gv.detalles).toHaveLength(5);
        expect(gv.detalles.map((d) => d.ITEMNO_ACC)).toEqual([1, 2, 3, 4, 5]);
        expect(sumDebe(gv)).toBeCloseTo(348, 4);
        expect(sumHaber(gv)).toBeCloseTo(348, 4);
    });

    test("moneda distinta a MXN usa tipoCambio del CFDI", async () => {
        AccountingExport.getRequestForExport.mockResolvedValue(
            makeRequest({
                imposedFee: 0,
                receipts: [
                    makeReceipt({
                        cfdiComprobante: { subtotal: 850, iva: 150, total: 1000, moneda: "USD", tipoCambio: 19 },
                    }),
                ],
            })
        );
        const [gv] = await AccountingExportService.getPolizasForRequest(222);
        expect(gv.header.CURRENCY).toBe("USD");
        expect(gv.header.EXCH_RATE).toBe(19);
    });

    test("COSTCENTER viene de user.department.costsCenter", async () => {
        AccountingExport.getRequestForExport.mockResolvedValue(
            makeRequest({
                imposedFee: 0,
                user: { userId: 5, department: { costsCenter: "203" } },
            })
        );
        const [gv] = await AccountingExportService.getPolizasForRequest(222);
        const debeGasto = gv.detalles.find((d) => d.GL_ACCOUNT === "1002");
        expect(debeGasto.COSTCENTER).toBe("203");
    });

    test("sin receipts con CFDI: solo AV (si hay anticipo), no GV", async () => {
        AccountingExport.getRequestForExport.mockResolvedValue(
            makeRequest({
                receipts: [makeReceipt({ cfdiComprobante: null })],
            })
        );
        const polizas = await AccountingExportService.getPolizasForRequest(222);
        expect(polizas).toHaveLength(1);
        expect(polizas[0].header.DOC_TYPE).toBe("AV");
    });

    test("Request no encontrado -> NotFoundError (status 404)", async () => {
        AccountingExport.getRequestForExport.mockResolvedValue(null);
        await expect(AccountingExportService.getPolizasForRequest(9999)).rejects.toMatchObject({
            status: 404,
        });
    });

    test("Request con status != 8 (Finalizado) -> ConflictError (status 409)", async () => {
        AccountingExport.getRequestForExport.mockResolvedValue(
            makeRequest({ requestStatusId: 4 })
        );
        await expect(AccountingExportService.getPolizasForRequest(222)).rejects.toMatchObject({
            status: 409,
        });
    });

    test("importes se redondean a 4 decimales", async () => {
        AccountingExport.getRequestForExport.mockResolvedValue(
            makeRequest({
                imposedFee: 0,
                receipts: [
                    makeReceipt({
                        cfdiComprobante: { subtotal: 100.123456, iva: 16.019753, total: 116.143209, moneda: "MXN", tipoCambio: 1 },
                    }),
                ],
            })
        );
        const [gv] = await AccountingExportService.getPolizasForRequest(222);
        for (const d of gv.detalles) {
            expect(Number.isFinite(d.AMT_DOCCUR)).toBe(true);
            const decimals = (String(d.AMT_DOCCUR).split(".")[1] || "").length;
            expect(decimals).toBeLessThanOrEqual(4);
        }
    });
});

describe("AccountingExportService.getPolizasInRange", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("concatena polizas de todos los requests finalizados del rango", async () => {
        AccountingExport.getFinalizedRequestsInRange.mockResolvedValue([
            makeRequest({ requestId: 222, imposedFee: 1000 }),
            makeRequest({ requestId: 223, imposedFee: 0 }),
        ]);
        const polizas = await AccountingExportService.getPolizasInRange(
            new Date("2026-01-01"),
            new Date("2026-12-31")
        );
        // 222 -> AV + GV (2), 223 -> GV (1)
        expect(polizas).toHaveLength(3);
        expect(polizas.map((p) => p.header.ID_VIAJE)).toEqual(["222", "222", "223"]);
    });

    test("rango vacio devuelve lista vacia", async () => {
        AccountingExport.getFinalizedRequestsInRange.mockResolvedValue([]);
        const polizas = await AccountingExportService.getPolizasInRange(
            new Date("2026-01-01"),
            new Date("2026-12-31")
        );
        expect(polizas).toEqual([]);
    });
});

describe("AccountingExportService.polizasToXml", () => {
    test("genera XML bien formado con estructura <Polizas><Poliza><Cabecera>...<Detalles><Detalle>", async () => {
        AccountingExport.getRequestForExport.mockResolvedValue(makeRequest());
        const polizas = await AccountingExportService.getPolizasForRequest(222);

        const xml = AccountingExportService.polizasToXml(polizas);
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);

        const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
        expect(parsed.Polizas).toBeDefined();
        const polizasArr = Array.isArray(parsed.Polizas.Poliza)
            ? parsed.Polizas.Poliza
            : [parsed.Polizas.Poliza];
        expect(polizasArr).toHaveLength(2);
        expect(polizasArr[0].Cabecera.DOC_TYPE).toBe("AV");
        const detalles0 = Array.isArray(polizasArr[0].Detalles.Detalle)
            ? polizasArr[0].Detalles.Detalle
            : [polizasArr[0].Detalles.Detalle];
        expect(detalles0[0].SHKZG).toBe("S");
        expect(detalles0[0].GL_ACCOUNT).toBe(1000);
    });

    test("lista vacia produce <Polizas/> valido", () => {
        const xml = AccountingExportService.polizasToXml([]);
        expect(xml).toContain("<Polizas");
        // No debe romper al parsear
        expect(() => new XMLParser().parse(xml)).not.toThrow();
    });
});
