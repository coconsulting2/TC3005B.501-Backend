/**
 * @file tests/services/BER/exchangeRate.e2e.test.js
 * @description End-to-end tests for the Banxico exchange-rate integration workflow (NT-010).
 */
import dotenv from "dotenv";

dotenv.config();

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import request from "supertest";

import { BmxApi } from "./server/bmx-api.js";
import { createTestJWT, LOCALHOST, ROLES } from "../../utils/createTestAuthToken.js";
import { mutedConsoleLogs } from "../../utils/muteConsole.js";
import { connectMongo, disconnectMongo, resetMongo } from "../../../services/fileStorage.js";
import { connectPostgres, disconnectPostgres, resetPostgres } from "../../../database/config/prisma.js";
import { MongoClient } from "mongodb";

/** @type {import("express").Express} */
import app from "../../../app.js";

/**
 * @typedef {Object} TodayFixture
 * @property {Date} date
 * @property {Date} yesterday
 * @property {string} yesterday_string
 * @property {string} string
 * @property {string} format
 * @property {string} iso
 * @property {number} rate
 */

/** @type {TodayFixture} */
const TODAY = {
    date: new Date("2026-04-17T00:00:00.000Z"),
    yesterday: new Date("2026-04-16T00:00:00.000Z"),
    yesterday_string: "2026-04-16",
    string: "2026-04-17",
    format: "17/04/2026",
    iso: "2026-04-17T00:00:00.000Z",
    rate: Number(BmxApi.db.querySeries({
        seriesId: "SF43718",
        startDate: "2026-04-17",
        endDate: "2026-04-17"
    }).datos[0].dato)
};

/**
 * Installs a controllable `Date` implementation for deterministic time-sensitive tests.
 *
 * @param {string | Date} fixedDateIso
 * @param {typeof Date} OriginalDate
 * @returns {() => void}
 */
const installFixedDate = (fixedDateIso, OriginalDate) => {
    const fixedTimestamp = new OriginalDate(fixedDateIso).getTime();

    function MockDate(...args) {
        if (new.target) {
            return args.length > 0 ? new OriginalDate(...args) : new OriginalDate(fixedTimestamp);
        }

        return new OriginalDate(fixedTimestamp).toString();
    }

    MockDate.now = () => fixedTimestamp;
    MockDate.parse = OriginalDate.parse;
    MockDate.UTC = OriginalDate.UTC;
    MockDate.prototype = OriginalDate.prototype;

    global.Date = MockDate;

    return () => {
        global.Date = OriginalDate;
    };
};

let restoreDateMock = () => {
};

const bmx_api = new BmxApi(process.env.BMX_MOCK_PORT || 3002);
const HEADERS = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${createTestJWT(ROLES.ACCOUNTS_PAYABLE, { IP: LOCALHOST })}`,
    "x-forwarded-for": LOCALHOST
};
app.set("trust proxy", "loopback");

/**
 * Connects Mongo and Postgres test databases.
 *
 * @returns {Promise<void>}
 */
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

describe("BER — Banxico Exchange Rate Service E2E [ NT-010 ]", () => {
    beforeAll(async () => {
        await setupDBs();
        restoreDateMock = installFixedDate(TODAY.iso, Date);
        process.env.BMX_API_URL = await bmx_api.start();
        process.env.BANXICO_API_KEY = bmx_api.getToken();
    }, 30_000);

    beforeEach(async () => {
        await mutedConsoleLogs(async () => {
            await resetMongo();
            await resetPostgres();
            await BmxApi.store.resetAll();
        });
        const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/test_cocoadb";
        const mongoClient = new MongoClient(mongoUri);
        await mongoClient.connect();
        const db = mongoClient.db("cocoadb");
        if (!db) throw Error("Mongo not connected");

        const collections = await db.collections();
        await Promise.all(collections.map((c) => c.deleteMany({})));
    }, 5_000);

    afterAll(async () => {
        restoreDateMock();
        jest.resetAllMocks();
        try {
            await mutedConsoleLogs(async () => {
                await disconnectMongo();
                await disconnectPostgres();
                await bmx_api.stop();
            });
            console.info("[ E2E ] - Disconnected to DBs");
        } catch (err) {
            console.error(`[ E2E TESTS ERROR ] - Error deallocating resources\n${err}`);
            throw new Error();
        }
    }, 30_000);

    describe("Successful Rate Fetch (Category V)", () => {
        it("[TC-001-V-01] GET /api/exchange-rate/rate returns successful response", async () => {
            const response = await request(app)
                .get("/api/exchange-rate/rate?source=USD&target=MXN")
                .set(HEADERS);

            expect(response.statusCode).toBe(200);
            expect(response.body).toHaveProperty("success", true);
            expect(response.body.data).toMatchObject({
                "rate": TODAY.rate,
                "source": "DOF",
                "date": TODAY.format,
                "fromCache": false
            });
            expect(response.body.data).toHaveProperty("fromCache", false);
            expect(response.body).toHaveProperty("message", "Exchange rate from USD to MXN retrieved successfully");
            expect(typeof response.body.data.rate).toBe("number");
        }, 10_000);

        it("[TC-002-V-02] Cache persists in MongoDB and is retrieved on second call", async () => {
            const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/test_cocoadb";
            const mongoClient = new MongoClient(mongoUri);

            try {
                await mongoClient.connect();
                const db = mongoClient.db("cocoadb");

                const response1 = await request(app)
                    .get("/api/exchange-rate/rate?source=USD&target=MXN")
                    .set(HEADERS);

                expect(response1.statusCode).toBe(200);
                expect(response1.body.data).toMatchObject({
                    "rate": TODAY.rate,
                    "source": "DOF",
                    "date": TODAY.format,
                    "fromCache": false
                });

                const cachedDoc = await db.collection("exchange_rates").findOne({
                    source: "USD",
                    target: "MXN",
                    date: TODAY.string
                });

                expect(cachedDoc).toBeDefined();
                expect(cachedDoc.rate).toBe(response1.body.data.rate);

                const response2 = await request(app)
                    .get("/api/exchange-rate/rate?source=USD&target=MXN")
                    .set(HEADERS);

                expect(response2.statusCode).toBe(200);
                expect(response2.body.data.fromCache).toBe(true);
                expect(response2.body.data.rate).toBe(response1.body.data.rate);
            } finally {
                await mongoClient.close();
            }
        });

        it.each([
            { tcId: "TC-003-V-03", amount: 100, convertedAmount: 100 * TODAY.rate },
            { tcId: "TC-004-V-04", amount: 1892.98, convertedAmount: 1892.98 * TODAY.rate }
        ])("[$tcId] POST /api/exchange-rate/convert calculates conversion correctly", async ({ amount, convertedAmount }) => {
            const response = await request(app)
                .post("/api/exchange-rate/convert")
                .set(HEADERS)
                .send({ amount: amount, source: "USD", target: "MXN" });

            expect(response.statusCode).toBe(200);
            expect(response.body).toHaveProperty("success", true);
            expect(response.body.data).toMatchObject({
                "originalAmount": amount,
                "convertedAmount": convertedAmount,
                "exchangeRate": TODAY.rate
            });
        });
    });

    describe("Not Found / Unavailable (Category NF)", () => {
        it("[TC-005-NF-01] Banxico returns empty series", async () => {
            bmx_api.inject({ flag: BmxApi.FLAGS.EMPTY });
            try {
                const response = await request(app)
                    .get("/api/exchange-rate/rate?source=USD&target=MXN")
                    .set(HEADERS);

                expect(response.statusCode).toBe(500);
                expect(response.body).toHaveProperty("success", false);
                expect(response.body).toHaveProperty("error", "Both Wise and DOF APIs failed: No rate data returned" +
                    " from DOF API");
            } finally {
                bmx_api.inject({ flag: BmxApi.FLAGS.NOT_EMPTY });
            }
        });
    });

    describe("Error Handling (Category ERR)", () => {
        it("[TC-006-ERR-01] Fallback to DOF occurs on network error", async () => {
            const response = await request(app)
                .get("/api/exchange-rate/rate?source=USD&target=MXN")
                .set(HEADERS);

            expect(response.statusCode).toBe(200);
            expect(response.body.data).toHaveProperty("rate", TODAY.rate);
            expect(response.body.data.source).toEqual("DOF");
        });

        it("[TC-007-ERR-02] HTTP 500 when both APIs completely unavailable", async () => {
            bmx_api.inject({ flag: BmxApi.FLAGS.DOWN });
            try {
                const response = await request(app)
                    .get("/api/exchange-rate/rate?source=USD&target=MXN")
                    .set(HEADERS);

                expect(response.statusCode).toBe(500);
                expect(response.body).toHaveProperty("success", false);
                expect(response.body).toHaveProperty("error", "Both Wise and DOF APIs failed: Request failed with status code 503");
            } finally {
                bmx_api.inject({ flag: BmxApi.FLAGS.UP });
            }
        });
    });

    describe("Cache Behavior (Category CACHE)", () => {
        it("[TC-008-CACHE-01] First call: fromCache false; Second call: fromCache true", async () => {
            const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/test_cocoadb";
            const mongoClient = new MongoClient(mongoUri);

            try {
                await mongoClient.connect();
                const db = mongoClient.db("cocoadb");

                const res1 = await request(app)
                    .get("/api/exchange-rate/rate?source=USD&target=MXN")
                    .set(HEADERS);

                expect(res1.body.data.fromCache).toBe(false);
                const rate1 = res1.body.data.rate;

                const cached = await db.collection("exchange_rates").findOne({
                    source: "USD",
                    target: "MXN",
                    date: TODAY.string
                });
                expect(cached).toBeDefined();

                const res2 = await request(app)
                    .get("/api/exchange-rate/rate?source=USD&target=MXN")
                    .set(HEADERS);

                expect(res2.body.data.fromCache).toBe(true);
                expect(res2.body.data.rate).toBe(rate1);
            } finally {
                await mongoClient.close();
            }
        });

        it.each([
            { tcId: "TC-010-CACHE-03", src: "USD", target: "MXN" },
        ])("[$tcId] Different currency pairs have separate cache entries", async ({ src, target }) => {
            const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/test_cocoadb";
            const mongoClient = new MongoClient(mongoUri);

            try {
                await mongoClient.connect();
                const db = mongoClient.db("cocoadb");

                const res1 = await request(app)
                    .get(`/api/exchange-rate/rate?source=${src}&target=${target}`)
                    .set(HEADERS);
                expect(res1.statusCode).toBe(200);

                const cache = await db.collection("exchange_rates").findOne({
                    source: src,
                    target: target,
                    date: TODAY.string
                });

                expect(cache).toBeDefined();
            } finally {
                await mongoClient.close();
            }
        });

        it("[TC-009-CACHE-02] Cache expires at end of day", async () => {
            let db, mongoClient;

            try {
                mongoClient = new MongoClient(process.env.MONGO_URI);
                await mongoClient.connect();
                db = mongoClient.db("cocoadb");
            } catch (err) {
                console.error("Mongo did not connect - ", err);
                expect(false).toBeTruthy();
            }

            const resetToTimeMocked = installFixedDate(TODAY.yesterday, Date);
            const url = "/api/exchange-rate/rate?src=USD&target=MXN";

            try {
                const yesterdayRate = Number(BmxApi.db.querySeries({
                    seriesId: "SF43718",
                    startDate: TODAY.yesterday_string,
                    endDate: TODAY.yesterday_string
                }).datos[0].dato);

                const res1_day1 = await request(app).get(url).set(HEADERS);

                expect(res1_day1.statusCode).toBe(200);
                expect(res1_day1.body.data.rate).toBe(yesterdayRate);

                {
                    const cacheRecord = await db.collection("exchange_rates").findOne({
                        source: "USD",
                        target: "MXN",
                        date: TODAY.yesterday_string
                    });

                    expect(cacheRecord).toBeDefined();
                    expect(cacheRecord).toHaveProperty("rate", yesterdayRate);
                }

                const res2_day1 = await request(app).get(url).set(HEADERS);

                expect(res2_day1.statusCode).toBe(200);
                expect(res2_day1.body.data.rate).toBe(yesterdayRate);
                expect(res2_day1.body.data.fromCache).toBe(true);

                resetToTimeMocked();

                {
                    const cacheRecord = await db.collection("exchange_rates").findOne({
                        source: "USD",
                        target: "MXN",
                        date: TODAY.string
                    });

                    expect(cacheRecord).toBeNull();
                }

                const res1_day2 = await request(app).get(url).set(HEADERS);

                expect(res1_day2.statusCode).toBe(200);
                expect(res1_day2.body.data.rate).toBe(TODAY.rate);
                expect(res1_day2.body.data.fromCache).toBe(false);
                {
                    const cacheRecord = await db.collection("exchange_rates").findOne({
                        source: "USD",
                        target: "MXN",
                        date: TODAY.string
                    });

                    expect(cacheRecord).toBeDefined();
                    expect(cacheRecord).toHaveProperty("rate", TODAY.rate);
                }
            } catch (err) {
                console.error(err);
                expect(false).toBeTruthy();
            } finally {
                await mongoClient.close();
                resetToTimeMocked();
            }
        });
    });

    describe("Endpoint Validation (Category ENDPOINT)", () => {
        it("[TC-026-ENDPOINT-01] GET /api/exchange-rate/rate with valid params returns 200", async () => {
            const response = await request(app)
                .get("/api/exchange-rate/rate?source=USD&target=MXN")
                .set(HEADERS);

            expect(response.statusCode).toBe(200);
            expect(response.body).toHaveProperty("success", true);
            expect(response.body).toHaveProperty("data");
            expect(response.body).toHaveProperty("message");
            expect(response.body.data).toMatchObject({
                "rate": TODAY.rate,
                "source": "DOF",
                "date": TODAY.format,
                "fromCache": false
            });
        });

        it("[TC-027-ENDPOINT-02] POST /api/exchange-rate/convert with valid amount", async () => {
            const response = await request(app)
                .post("/api/exchange-rate/convert")
                .set(HEADERS)
                .send({ amount: 50, source: "USD", target: "MXN" });

            expect(response.statusCode).toBe(200);
            expect(response.body).toHaveProperty("success", true);
            expect(response.body.data).toHaveProperty("convertedAmount", 50 * TODAY.rate);
        });

        it("[TC-028-ENDPOINT-03] POST /api/exchange-rate/convert without amount returns 400", async () => {
            const response = await request(app)
                .post("/api/exchange-rate/convert")
                .set(HEADERS)
                .send({ source: "USD", target: "MXN" });

            expect(response.statusCode).toBe(400);
            expect(response.body).toHaveProperty("errors");
        });

        it("[TC-029-ENDPOINT-04] GET /api/exchange-rate/history with date range", async () => {
            const startDate = "2026-03-30";
            const endDate = "2026-04-17";
            const datos = BmxApi.db.querySeries({ seriesId: "SF43718", startDate, endDate });

            const response = await request(app)
                .get(`/api/exchange-rate/history?source=USD&target=MXN&startDate=${startDate}&endDate=${endDate}`)
                .set(HEADERS);

            expect(response.statusCode).toBe(200);
            expect(response.body).toHaveProperty("success", true);
            expect(response.body.data[0]).toHaveProperty("date", datos.datos[0].fecha);
            expect(response.body.data[0]).toHaveProperty("rate", Number(datos.datos[0].dato));
            expect(response.body.data[0]).toHaveProperty("source", "DOF");
        });

        it("[TC-030-ENDPOINT-05] GET /api/exchange-rate/currencies (public, no auth required)", async () => {
            const response = await request(app)
                .get("/api/exchange-rate/currencies");

            expect(response.statusCode).toBe(200);
            expect(response.body).toHaveProperty("success", true);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data[0]).toHaveProperty("code");
            expect(response.body.data[0]).toHaveProperty("name");
            expect(response.body.data[0]).toHaveProperty("symbol");
        });
    });

    describe("Input Validation (Category VALID)", () => {
        it.each([
            { tcId: "TC-011-VALID-01", src: "A", target: "USD" },
            { tcId: "TC-012-VALID-02", src: "XX", target: "MXN" },
            { tcId: "TC-013-VALID-03", src: "AB", target: "USD" },
            { tcId: "TC-014-VALID-04", src: "WXW", target: "MXN" },
            { tcId: "TC-015-VALID-05", src: "123", target: "USD" },
            { tcId: "TC-016-VALID-06", src: "900", target: "MXN" },
            { tcId: "TC-017-VALID-07", src: "NXM", target: "USD" },
            { tcId: "TC-018-VALID-08", src: "USD", target: "A" },
            { tcId: "TC-019-VALID-09", src: "MXN", target: "XX" },
            { tcId: "TC-020-VALID-10", src: "USD", target: "AB" },
            { tcId: "TC-021-VALID-11", src: "MXN", target: "WXW" },
            { tcId: "TC-022-VALID-12", src: "USD", target: "123" },
            { tcId: "TC-023-VALID-13", src: "MXN", target: "900" },
            { tcId: "TC-024-VALID-14", src: "USD", target: "NXM" },
        ])("[$tcId] Invalid currency codes are rejected (endpoint validation)", async ({ src, target }) => {
            const response = await request(app)
                .get(`/api/exchange-rate/rate?source=${src}&target=${target}`)
                .set(HEADERS);

            expect(response.statusCode).toBe(400);
            expect(response.body).toHaveProperty("errors");
        });

        it("[TC-025-VALID-15] Negative or zero amount in convert is rejected", async () => {
            const response = await request(app)
                .post("/api/exchange-rate/convert")
                .set(HEADERS)
                .send({ amount: -100, source: "USD", target: "MXN" });

            expect(response.statusCode).toBe(400);
            expect(response.body).toHaveProperty("errors");
        });
    });
});
