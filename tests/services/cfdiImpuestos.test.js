/**
 * @file tests/services/cfdiImpuestos.test.js
 */
import { describe, test, expect } from "@jest/globals";
import {
    buildImpuestosFromTaxesBreakdown,
    resolveImpuestosFromComprobante,
    cfdiTotalsAreCoherent,
    sumRetencionesFromImpuestos,
    impuestosNeedManualReview,
    isIvaTrasladoAcreditable,
    glAccountForImpuesto,
    resolveExtendedGlCatalogFromAccounts,
    resolveGastoBaseFromComprobante,
    AMOUNT_EPSILON,
} from "../../services/cfdiImpuestos.js";
import { GL_ACCOUNTS } from "../../config/accountingCatalogs.js";

const glDefaults = () =>
    resolveExtendedGlCatalogFromAccounts([
        { accountCode: "1004", accountType: "RetencionIsr", active: true },
        { accountCode: "1005", accountType: "RetencionIva", active: true },
    ]);

describe("cfdiTotalsAreCoherent", () => {
    test("incluye descuento (ejemplo SAT Anexo 20)", () => {
        const impuestos = [{ codigo: "002", tipo: "traslado", importe: 144 }];
        expect(cfdiTotalsAreCoherent(1000, 100, impuestos, 1044)).toBe(true);
    });

    test("freelancer: subtotal + IVA − retenciones = total", () => {
        const impuestos = buildImpuestosFromTaxesBreakdown({
            traslados: [{ impuesto: "002", importe: 1498.8, base: 9367.5, tasaOCuota: 0.16 }],
            retenciones: [
                { impuesto: "002", importe: 999.14 },
                { impuesto: "001", importe: 117.09 },
            ],
        });
        expect(cfdiTotalsAreCoherent(9367.5, 0, impuestos, 9750.07)).toBe(true);
    });

    test("rechaza descuadre mayor a epsilon SAT", () => {
        const impuestos = [{ codigo: "002", tipo: "traslado", importe: 16 }];
        expect(cfdiTotalsAreCoherent(100, 0, impuestos, 150)).toBe(false);
        expect(AMOUNT_EPSILON).toBe(0.01);
    });
});

describe("buildImpuestosFromTaxesBreakdown", () => {
    test("retenciones conservan base y tasa", () => {
        const impuestos = buildImpuestosFromTaxesBreakdown({
            retenciones: [
                {
                    impuesto: "001",
                    importe: 117.09,
                    base: 9367.5,
                    tasaOCuota: 0.0125,
                },
            ],
        });
        expect(impuestos[0].base).toBe(9367.5);
        expect(impuestos[0].tasa).toBe(0.0125);
    });

    test("IVA 002 acreditable con G03, no con S01", () => {
        const g03 = buildImpuestosFromTaxesBreakdown(
            { traslados: [{ impuesto: "002", importe: 160 }] },
            { usoCfdi: "G03" },
        );
        const s01 = buildImpuestosFromTaxesBreakdown(
            { traslados: [{ impuesto: "002", importe: 160 }] },
            { usoCfdi: "S01" },
        );
        expect(g03[0].acreditable).toBe(true);
        expect(s01[0].acreditable).toBe(false);
        expect(isIvaTrasladoAcreditable("G03", "002")).toBe(true);
        expect(isIvaTrasladoAcreditable("S01", "002")).toBe(false);
    });

    test("conserva traslado IVA en cero para trazabilidad", () => {
        const impuestos = buildImpuestosFromTaxesBreakdown({
            traslados: [{ impuesto: "002", importe: 0 }],
        });
        expect(impuestos).toHaveLength(1);
        expect(impuestos[0].importe).toBe(0);
    });
});

describe("resolveImpuestosFromComprobante", () => {
    test("JSON persistido con ISR+IVA no requiere revisión manual", () => {
        const impuestos = resolveImpuestosFromComprobante({
            subtotal: 9367.5,
            iva: 1498.8,
            total: 9750.07,
            impuestos: [
                { codigo: "002", tipo: "traslado", importe: 1498.8 },
                { codigo: "002", tipo: "retencion", importe: 999.14 },
                { codigo: "001", tipo: "retencion", importe: 117.09 },
            ],
        });
        expect(impuestosNeedManualReview(impuestos)).toBe(false);
        expect(sumRetencionesFromImpuestos(impuestos)).toBeCloseTo(1116.23, 2);
    });

    test("legacy sin desglose marca legacyAggregated (no asume todo IVA)", () => {
        const impuestos = resolveImpuestosFromComprobante({
            subtotal: 9367.5,
            iva: 1498.8,
            total: 9750.07,
            totalRetenidos: 1116.23,
        });
        expect(impuestosNeedManualReview(impuestos)).toBe(true);
        const ret = impuestos.filter((i) => i.tipo === "retencion");
        expect(ret).toHaveLength(1);
        expect(ret[0].legacyAggregated).toBe(true);
    });
});

describe("resolveGastoBaseFromComprobante", () => {
    test("subtotal menos descuento", () => {
        expect(resolveGastoBaseFromComprobante({ subtotal: 1000, descuento: 100 })).toBe(900);
    });
});

describe("glAccountForImpuesto", () => {
    test("retención IEPS lanza UNSUPPORTED_RETENCION_IEPS", () => {
        const gl = glDefaults();
        expect(() =>
            glAccountForImpuesto({ codigo: "003", tipo: "retencion", importe: 10 }, gl),
        ).toThrow(expect.objectContaining({ code: "UNSUPPORTED_RETENCION_IEPS" }));
    });

    test("IVA no acreditable va a gasto", () => {
        const gl = glDefaults();
        const account = glAccountForImpuesto(
            { codigo: "002", tipo: "traslado", importe: 160, acreditable: false },
            gl,
        );
        expect(account).toBe(gl.gasto);
    });

    test("accountType gana sobre accountCode en catálogo", () => {
        const gl = resolveExtendedGlCatalogFromAccounts([
            { accountCode: "9999", accountType: "RetencionIsr", active: true },
        ]);
        expect(gl.retencionIsr).toBe("9999");
        expect(gl.retencionIva).toBe(GL_ACCOUNTS.RETENCION_IVA);
    });
});
