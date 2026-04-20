/**
 * @file tests/config/accountingCatalogs.test.js
 * @description Unit tests for pure helpers in accountingCatalogs.
 */
import { describe, test, expect } from "@jest/globals";
import {
    SOCIEDAD_DEFAULT,
    SOCIEDADES,
    GL_ACCOUNTS,
    GL_ACCOUNT_DESCRIPTIONS,
    DOC_TYPES,
    SHKZG,
    proveedorFromUserId,
    formatPstngDate,
} from "../../config/accountingCatalogs.js";

describe("accountingCatalogs constants", () => {
    test("SOCIEDAD_DEFAULT maps to a known sociedad with MXN local currency", () => {
        expect(SOCIEDADES[SOCIEDAD_DEFAULT]).toBeDefined();
        expect(SOCIEDADES[SOCIEDAD_DEFAULT].monedaLocal).toBe("MXN");
    });

    test("GL_ACCOUNTS cubren las 4 cuentas del Excel (1000/1001/1002/1003)", () => {
        expect(GL_ACCOUNTS.ANTICIPO).toBe("1000");
        expect(GL_ACCOUNTS.CUENTA_POR_PAGAR_EMPLEADO).toBe("1001");
        expect(GL_ACCOUNTS.GASTO_DE_VIAJE).toBe("1002");
        expect(GL_ACCOUNTS.IVA_ACREDITABLE).toBe("1003");
    });

    test("GL_ACCOUNT_DESCRIPTIONS coinciden con Excel", () => {
        expect(GL_ACCOUNT_DESCRIPTIONS["1000"]).toBe("Anticipo");
        expect(GL_ACCOUNT_DESCRIPTIONS["1003"]).toBe("Iva Acreditable");
    });

    test("DOC_TYPES AV y GV son los del Excel", () => {
        expect(DOC_TYPES.ANTICIPO_VIAJE).toBe("AV");
        expect(DOC_TYPES.GASTO_VIAJE).toBe("GV");
    });

    test("SHKZG usa S (debe) y H (haber)", () => {
        expect(SHKZG.DEBE).toBe("S");
        expect(SHKZG.HABER).toBe("H");
    });
});

describe("proveedorFromUserId", () => {
    test("devuelve 11 digitos para userId=5 (patron del Excel: 20000000005-like)", () => {
        const v = proveedorFromUserId(5);
        expect(v).toMatch(/^\d{11}$/);
        expect(v).toBe("20000000005");
    });

    test("es deterministico para el mismo userId", () => {
        expect(proveedorFromUserId(42)).toBe(proveedorFromUserId(42));
    });

    test("userId 0 no rompe y mantiene longitud 11", () => {
        const v = proveedorFromUserId(0);
        expect(v).toMatch(/^\d{11}$/);
    });

    test("userId grande mantiene longitud 11 (slice recorta)", () => {
        const v = proveedorFromUserId(999999);
        expect(v).toHaveLength(11);
    });
});

describe("formatPstngDate", () => {
    test("formatea DD/MM/YYYY con padding de ceros", () => {
        const d = new Date(2026, 3, 5); // 5 abril 2026
        expect(formatPstngDate(d)).toBe("05/04/2026");
    });

    test("diciembre 31 devuelve '31/12/YYYY'", () => {
        const d = new Date(2025, 11, 31);
        expect(formatPstngDate(d)).toBe("31/12/2025");
    });
});
