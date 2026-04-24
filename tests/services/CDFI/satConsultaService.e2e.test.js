/**
 * @file tests/services/CDFI/satConsultaService.real.e2e.test.js
 * @description Opt-in live SAT checks using real CFDI XML invoices.
 * @NOTE dev in process, not a real ticket, it's a nice to have for future testing
 *
 * This suite is skipped by default and only runs with RUN_REAL_SAT_TESTS=1.
 * example cmd:
 * NODE_OPTIONS='--experimental-vm-modules' \
 * bunx jest tests/services/CDFI/satConsultaService.e2e.test.js \
 * --runInBand --verbose --testTimeout=120000
 */
import dotenv from "dotenv";
import { describe, it, expect, beforeAll } from "@jest/globals";
import { readdir, readFile } from "fs/promises";
import path from "path";

import { parseCFDI } from "../../../services/cfdiParserService.js";
import { consultarCfdiOnce } from "../../../services/satConsultaService.js";

dotenv.config();

const RUN_REAL_SAT_TESTS = process.env.RUN_REAL_SAT_TESTS === "1";
const FIXTURES_PATH = "tests/services/CDFI/tax_invoices(CFDIs)/real";

const PROJECT_ROOT = path.resolve(process.cwd());
const SW_FIXTURES_DIR = path.join(PROJECT_ROOT, FIXTURES_PATH);

async function loadXmlFiles(dirPath) {
    const names = await readdir(dirPath);
    const xmlNames = names.filter((name) => name.toLowerCase().endsWith(".xml"));
    return Promise.all(
        xmlNames.map(async (name) => ({
            name,
            content: await readFile(path.join(dirPath, name), "utf-8"),
        }))
    );
}

async function loadRealInvoiceFixtures() {
    try {
        const swFixtures = await loadXmlFiles(SW_FIXTURES_DIR);
        if (swFixtures.length > 0) {
            return { source: SW_FIXTURES_DIR, files: swFixtures };
        }
    } catch {
        throw new Error(`No dedicated SW fixtures folder yet.\nCreate one at ${FIXTURES_PATH} to run tests.`);
    }
}

const describeIfEnabled = RUN_REAL_SAT_TESTS ? describe : describe.skip;

describeIfEnabled("satConsultaService against real SAT API", () => {
    /** @type {{ source: string, files: Array<{name: string, content: string}> }} */
    let fixtures;

    beforeAll(async () => {
        fixtures = await loadRealInvoiceFixtures();
        if (!fixtures.files.length) {
            throw new Error(
                "No XML fixtures available for real SAT tests. Add XML files under tests/services/CDFI/real-sat/invoices."
            );
        }
    });

    it("queries SAT for each available invoice and returns a normalized result", async () => {
        const results = [];

        for (const fixture of fixtures.files) {
            const parsed = parseCFDI(fixture.content);
            const acuse = await consultarCfdiOnce({
                rfcEmisor: parsed.rfcEmisor,
                rfcReceptor: parsed.rfcReceptor,
                total: parsed.total,
                uuid: parsed.uuid,
                selloUltimos8: parsed.selloUltimos8,
            });

            results.push({ fixture: fixture.name, acuse });

            /**
             * @NOTE: Real SAT status can vary over time (Vigente/Cancelado/No Encontrado), so this test validates
             * response integrity instead of pinning one state.
             */
            expect(acuse.codigoEstatus).toMatch(/^[SN]\s*-/);
            expect(typeof acuse.estado).toBe("string");
            expect(acuse.estado.length).toBeGreaterThan(0);
            expect(typeof acuse.validacionEFOS).toBe("string");
        }
        expect(results.length).toBeGreaterThan(0);
        console.warn(`[REAL SAT] Source: ${fixtures.source} | Consulted: ${results.length} invoice(s)`);
    });
});

