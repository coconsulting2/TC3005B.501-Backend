import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import soap from "soap";

import {startSATMockServer, stopSATMockServer} from "./mock-server.js";

describe("Test mock server", () => {
    let client;

    beforeAll(async () => {
        process.env.SAT_WSDL_URL = await startSATMockServer();
        client = await soap.createClientAsync(process.env.SAT_WSDL_URL);
    });

    afterAll(async () => {
        await stopSATMockServer();
    });

    async function consulta(expresionImpresa) {
        const [res] = await client.ConsultaAsync({ expresionImpresa });
        return res.ConsultaResult;
    }

    it("returns Vigente + EFOS 200 for a valid query", async () => {
        const result = await consulta("?re=AAA010101AAA&rr=COSC8001137NA&tt=1160.00&id=8d84bb5b-cf3a-4e71-946e-6f3c2f6af947");
        expect(result.Estado).toBe("Vigente");
        expect(result.ValidacionEFOS).toBe("200");
        expect(result.CodigoEstatus).toMatch(/^S\s-/);
    });

    it("supports FE and returns not found when FE mismatches", async () => {
        const ok = await consulta("?re=AAA010101AAA&rr=COSC8001137NA&tt=1160.00&id=8d84bb5b-cf3a-4e71-946e-6f3c2f6af947&fe=2f6af947");
        expect(ok.Estado).toBe("Vigente");

        const notFound = await consulta("?re=AAA010101AAA&rr=COSC8001137NA&tt=1160.00&id=8d84bb5b-cf3a-4e71-946e-6f3c2f6af947&fe=FFFFFFFF");
        expect(notFound.Estado).toBe("No Encontrado");
        expect(notFound.CodigoEstatus).toContain("N - 602");
    });

    it("returns N-602 for unknown UUID", async () => {
        const result = await consulta("?re=AAA010101AAA&rr=COSC8001137NA&tt=1160.00&id=11111111-1111-4111-8111-111111111111");
        expect(result.Estado).toBe("No Encontrado");
        expect(result.CodigoEstatus).toContain("N - 602");
    });

    it("returns N-601 for malformed precision and illegal RFC", async () => {
        const badPrecision = await consulta("?re=AAA010101AAA&rr=COSC8001137NA&tt=1160.0&id=8d84bb5b-cf3a-4e71-946e-6f3c2f6af947");
        expect(badPrecision.CodigoEstatus).toContain("N - 601");

        const badRfc = await consulta("?re=@@@&rr=COSC8001137NA&tt=1160.00&id=8d84bb5b-cf3a-4e71-946e-6f3c2f6af947");
        expect(badRfc.CodigoEstatus).toContain("N - 601");
    });

    it("returns EFOS warning codes for configured scenarios", async () => {
        const efos100 = await consulta("?re=AAA010101AAA&rr=COSC8001137NA&tt=754.00&id=3e13d569-b5b0-4de2-9cb3-bba4fb481d76");
        expect(efos100.ValidacionEFOS).toBe("100");

        const efos101 = await consulta("?re=AAA010101AAA&rr=COSC8001137NA&tt=672.80&id=8b3977f2-75f0-4214-8960-1378d86efa53");
        expect(["101", "104"]).toContain(efos101.ValidacionEFOS);

        const efos102 = await consulta("?re=AAA010101AAA&rr=COSC8001137NA&tt=1508.00&id=98078e45-89e8-4fd2-8331-e06a1933c61e");
        expect(["102", "103"]).toContain(efos102.ValidacionEFOS);
    });
});
