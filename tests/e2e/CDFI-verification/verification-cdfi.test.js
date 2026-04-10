/**
 * @file tests/<>/CDFI-verification
 * @description Integration tests for CDFI verification service [ NT-009 ]
 * @author Angel Montemayor
 */
import dotenv from "dotenv";

dotenv.config();

import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from "@jest/globals";
import request from "supertest";

import { connectMongo, disconnectMongo, resetMongo } from "../../../services/fileStorage.js";
import { connectPostgres, disconnectPostgres, resetPostgres } from "../../../database/config/prisma.js";

/** @type {app} Express */
import app from "../../../app.js";
import { start_sat_api_mock_server, stop_sat_api_mock_server } from "./mock.js";


async function mutedConsoleLogs(fn) {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {
    });
    try {
        return await fn();
    } finally {
        logSpy.mockRestore();
    }
}


describe.skip("Tests CDFI Verification service", () => {
    beforeAll(async () => {
        try {
            await mutedConsoleLogs(async () => {
                await connectMongo();
                await connectPostgres();
            });
            console.info("[ E2E ] - Connected to DBs"); // eslint-disable-line no-console
        } catch (err) {
            console.error(`[ E2E TESTS FAILED ] - Could not Connect to Database\n${err.message}`);
            throw new Error();
        }

        try {
            await mutedConsoleLogs(async () => {
                await start_sat_api_mock_server();
                console.info("[ E2E ] - Mock SAT server initialized."); // eslint-disable-line no-console
            });
        } catch (err) {
            console.error(`[ E2E TESTS FAILED ] - Could not initialize mock server "SAT CDFI Verification service"\n${err.message}`);
            throw new Error();
        }
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
                await stop_sat_api_mock_server();
            });
            console.info("[ E2E ] - Disconnected to DBs");// eslint-disable-line no-console
        } catch (err) {
            console.error(`[ E2E TESTS ERROR ] - Error deallocating resources\n${err}`);
            throw new Error();
        }
    }, 30_000);

    it("Simple test", async () => {
        const res = await request(app).get("/health");

        expect(res.statusCode).toBe(200);
        expect(res.text).toBe("Server running OK");
    });

    it("Valid CDFI", async () => {
       const res = await request(app()).post("/api/comprobantes/");
    });
});
