/**
 * @file tests/services/BER/server/bmx-api.test.js
 * @description Contract tests for the BER Banxico mock API server.
 */

import dotenv from "dotenv";

dotenv.config();

import { beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";

import { BmxApi } from "./bmx-api.js";

const VALID_TOKEN = BmxApi.getToken();
const SERIES_ID = "SF43718";
const SERIES_TITLE = "Tipo de cambio                                          Pesos por dólar E.U.A. Tipo de cambio para solventar obligaciones denominadas en moneda extranjera Fecha de determinación (FIX)";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const JSON_HEADERS = {
    "access-control-allow-headers": "Bmx-Token, Accept, Accept-Encoding, Content-Type",
    "access-control-allow-methods": "GET",
    "access-control-allow-origin": "*",
    "content-language": "es",
    "content-security-policy": "script-src 'self'",
    "content-type": JSON_CONTENT_TYPE,
};

const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
const decimalPattern = /^\d+(?:\.\d+)?$/;

/**
 * Builds the Banxico series endpoint URL without a date range.
 *
 * @param {string} [seriesId=SERIES_ID]
 * @returns {string}
 */
function getSeriesPath(seriesId = SERIES_ID) {
    return `/SieAPIRest/service/v1/series/${seriesId}/datos/`;
}

/**
 * Builds the Banxico series endpoint URL with date range parameters.
 *
 * @param {string} [seriesId=SERIES_ID]
 * @param {string} startDate
 * @param {string} endDate
 * @returns {string}
 */
function getRangePath(seriesId = SERIES_ID, startDate, endDate) {
    return `/SieAPIRest/service/v1/series/${seriesId}/datos/${startDate}/${endDate}`;
}

/**
 * Verifies shared response headers returned by the mock API.
 *
 * @param {import("supertest").Response} response
 * @param {{ contentType?: string }} [options]
 * @returns {void}
 */
function assertCommonHeaders(response, { contentType = JSON_CONTENT_TYPE } = {}) {
    expect(response.headers["access-control-allow-headers"]).toBe(JSON_HEADERS["access-control-allow-headers"]);
    expect(response.headers["access-control-allow-methods"]).toBe(JSON_HEADERS["access-control-allow-methods"]);
    expect(response.headers["access-control-allow-origin"]).toBe(JSON_HEADERS["access-control-allow-origin"]);
    expect(response.headers["content-language"]).toBe(JSON_HEADERS["content-language"]);
    expect(response.headers["content-security-policy"]).toBe(JSON_HEADERS["content-security-policy"]);
    expect(response.headers["content-type"]).toContain(contentType);
    expect(typeof response.headers.date).toBe("string");
    expect(response.headers.date.length).toBeGreaterThan(0);
}

/**
 * Asserts the token validation error payload.
 *
 * @param {unknown} body
 * @returns {void}
 */
function assertTokenInvalidBody(body) {
    expect(body).toEqual({
        error: {
            url: "https://localhost:bmxmokcport/SieAPIRest/service/v1/token",
            mensaje: "Token inválido",
            detalle: "El token enviado no es válido, favor de verificar. Para obtener un token consultar la url adjunta.",
        },
    });
}

/**
 * Asserts invalid date format payload for ranged requests.
 *
 * @param {unknown} body
 * @returns {void}
 */
function assertBadDateFormat(body) {
    expect(body).toEqual({
        "error": {
            "mensaje": "Formato de fecha incorrecto.",
            "detalle": "El formato de la fecha enviada es incorrecto. Debe ser yyyy-MM-dd."
        }
    });
}

/**
 * Asserts invalid series format payload.
 *
 * @param {unknown} body
 * @returns {void}
 */
function assertSeriesErrorBody(body) {
    expect(body).toEqual({
        error: {
            mensaje: "Formato de series incorrecto.",
            detalle: "Formato de series debe ser SX####[-SX####][,SX####[-SX####]]",
            test_msg: "Mock server only supports series 'SF43718' MXN | USD"
        },
    });
}

/**
 * Asserts rate-limit error payload shape.
 *
 * @param {unknown} body
 * @returns {void}
 */
function assertRateLimitBody(body) {
    expect(body).toHaveProperty("error.mensaje", "Límite de consultas superado.");
    expect(body).toHaveProperty("error.detalle");
    expect(body).toHaveProperty("error.timeReset");
    expect(body).toHaveProperty("error.secondsToReset");
}

/**
 * Asserts Banxico series payload structure and optional date filtering bounds.
 *
 * @param {import("supertest").Response} response
 * @param {{ expectDatos?: boolean, minDatos?: number, startDate?: string, endDate?: string }} [options]
 * @returns {void}
 */
function assertSeriesPayload(response, { expectDatos = true, minDatos = 1, startDate, endDate } = {}) {
    expect(response.body).toHaveProperty("bmx");
    expect(Array.isArray(response.body.bmx.series)).toBe(true);
    expect(response.body.bmx.series).toHaveLength(1);

    const series = response.body.bmx.series[0];
    expect(series.idSerie).toBe(SERIES_ID);
    expect(series.titulo).toBe(SERIES_TITLE);

    if (!expectDatos) {
        expect(series).not.toHaveProperty("datos");
        return;
    }

    expect(Array.isArray(series.datos)).toBe(true);
    expect(series.datos.length).toBeGreaterThanOrEqual(minDatos);

    const lowerBound = startDate ? Date.parse(`${startDate}T00:00:00Z`) : Number.NEGATIVE_INFINITY;
    const upperBound = endDate ? Date.parse(`${endDate}T23:59:59.999Z`) : Number.POSITIVE_INFINITY;

    for (const datum of series.datos) {
        expect(datum).toEqual(expect.objectContaining({
            fecha: expect.any(String),
            dato: expect.any(String),
        }));
        expect(datum.fecha).toMatch(datePattern);
        expect(datum.dato).toMatch(decimalPattern);

        if (startDate || endDate) {
            const [day, month, year] = datum.fecha.split("/").map(Number);
            const current = Date.UTC(year, month - 1, day);
            expect(current).toBeGreaterThanOrEqual(lowerBound);
            expect(current).toBeLessThanOrEqual(upperBound);
        }
    }
}

describe("Banxico mock API contract", () => {
    beforeEach(async () => {
        await BmxApi.store.resetAll();
    });

    describe("Health check", () => {
        it("Health check", async () => {
            const response = await request(BmxApi.app).get("/health");

            expect(response.statusCode).toBe(200);
        });
    });

    describe("GET /SieAPIRest/service/v1/series/:seriesId/datos/", () => {
        describe("Auth", () => {
            it("returns 400 when token is missing", async () => {
                const response = await request(BmxApi.app).get(getSeriesPath(SERIES_ID));

                expect(response.statusCode).toBe(400);
                assertCommonHeaders(response);
                assertTokenInvalidBody(response.body);
            });

            it("returns 400 when token is invalid", async () => {
                const response = await request(BmxApi.app).get(getSeriesPath(SERIES_ID))
                    .set("Bmx-Token", "x".repeat(64));

                expect(response.statusCode).toBe(400);
                assertCommonHeaders(response);
                assertTokenInvalidBody(response.body);
            });

            it("accepts token as query param", async () => {
                const response = await request(BmxApi.app).get(`${getSeriesPath(SERIES_ID)}?token=${VALID_TOKEN}`);

                expect(response.statusCode).toBe(200);
                assertCommonHeaders(response);
                assertSeriesPayload(response, { minDatos: 1 });
            });
        });

        describe("Series format", () => {
            it.each(["INVALID", "123", "sf43718", "SF-43718"])(
                "returns 400 for invalid series format %s",
                async (seriesId) => {
                    const response = await request(BmxApi.app).get(getSeriesPath(seriesId))
                        .set("Bmx-Token", VALID_TOKEN);

                    expect(response.statusCode).toBe(400);
                    assertCommonHeaders(response);
                    assertSeriesErrorBody(response.body);
                }
            );

            it.each([
                "SF60648"
            ])("returns 404 for a valid-format but unsupported series and keeps the HTML contract", async (seriesId) => {
                const response = await request(BmxApi.app).get(getSeriesPath(seriesId))
                    .set("Bmx-Token", VALID_TOKEN);

                expect(response.statusCode).toBe(404);
                assertCommonHeaders(response, { contentType: "text/html" });
                expect(response.text).toContain("Mock server only supports series 'SF43718' MXN | USD");
            });
        });

        describe("Rate limit", () => {
            it("returns 429 with Banxico rate-limit payload once the limit is exceeded", async () => {
                let response;

                for (let i = 0; i < 201; i += 1) {
                    response = await request(BmxApi.app).get(getSeriesPath(SERIES_ID))
                        .set("Bmx-Token", "e3980208bf01ec653aba9aee3c2d6f70f6ae8b066d2545e379b9e0ef92e9de25");
                }

                expect(response.statusCode).toBe(429);
                expect(response.headers["bmx-timereset"]).toBeDefined();
                expect(response.headers["bmx-secondstoreset"]).toBeDefined();
                assertRateLimitBody(response.body);
            });
        });

        describe("Happy path", () => {
            it("returns the SF43718 series data with a valid token in the header", async () => {
                const response = await request(BmxApi.app).get(getSeriesPath(SERIES_ID))
                    .set("Bmx-Token", VALID_TOKEN);

                expect(response.statusCode).toBe(200);
                assertCommonHeaders(response);
                assertSeriesPayload(response, { minDatos: 1 });
                expect(response.body.bmx.series[0].datos[0]).toEqual(expect.objectContaining({
                    dato: "3.0735",
                    fecha: "12/11/1991",
                    timestamp: 689904000000,
                }));
            });
        });
    });

    describe("GET /SieAPIRest/service/v1/series/:seriesId/datos/:startDate/:endDate", () => {
        describe("Auth", () => {
            it("returns 400 when token is missing", async () => {
                const response = await request(BmxApi.app).get(getRangePath(SERIES_ID, "2015-01-01", "2015-01-08"));

                expect(response.statusCode).toBe(400);
                assertCommonHeaders(response);
                assertTokenInvalidBody(response.body);
            });

            it("returns 400 when token is invalid", async () => {
                const response = await request(BmxApi.app).get(getRangePath(SERIES_ID, "2015-01-01", "2015-01-08"))
                    .set("Bmx-Token", "y".repeat(64));

                expect(response.statusCode).toBe(400);
                assertCommonHeaders(response);
                assertTokenInvalidBody(response.body);
            });

            it("accepts token as query param", async () => {
                const response = await request(BmxApi.app).get(`${getRangePath(SERIES_ID, "2015-01-01", "2015-01-08")}?token=${VALID_TOKEN}`);

                expect(response.statusCode).toBe(200);
                assertCommonHeaders(response);
                assertSeriesPayload(response, {
                    expectDatos: true,
                    startDate: "2015-01-01",
                    endDate: "2015-01-08",
                });
            });
        });

        describe("Series format", () => {
            it.each(["INVALID", "123", "sf43718", "SF-43718"])(
                "returns 400 for invalid series format %s",
                async (seriesId) => {
                    const response = await request(BmxApi.app).get(getRangePath(seriesId, "2015-01-01", "2015-01-08"))
                        .set("Bmx-Token", VALID_TOKEN);

                    expect(response.statusCode).toBe(400);
                    assertCommonHeaders(response);
                    assertSeriesErrorBody(response.body);
                }
            );

            it.each([
                "SF60648"
            ])("returns 404 for a valid-format but unsupported series and keeps the HTML contract", async (seriesId) => {
                const response = await request(BmxApi.app).get(getRangePath(seriesId, "2015-01-01", "2015-01-08"))
                    .set("Bmx-Token", VALID_TOKEN);

                expect(response.statusCode).toBe(404);
                assertCommonHeaders(response, { contentType: "text/html" });
                expect(response.text).toContain("Mock server only supports series 'SF43718' MXN | USD");
            });
        });

        describe("Rate limit", () => {
            it("returns 429 with Banxico rate-limit payload once the limit is exceeded", async () => {
                let response;

                for (let i = 0; i < 201; i += 1) {
                    response = await request(BmxApi.app).get(getRangePath(SERIES_ID, "2015-01-01", "2015-01-08"))
                        .set("Bmx-Token", VALID_TOKEN);
                }

                expect(response.statusCode).toBe(429);
                expect(response.headers["bmx-timereset"]).toBeDefined();
                expect(response.headers["bmx-secondstoreset"]).toBeDefined();
                assertRateLimitBody(response.body);
            });
        });

        describe("Happy path", () => {
            it("returns data within the requested date range", async () => {
                const response = await request(BmxApi.app).get(getRangePath(SERIES_ID, "2015-01-02", "2015-01-08"))
                    .set("Bmx-Token", VALID_TOKEN);

                expect(response.statusCode).toBe(200);
                assertCommonHeaders(response);
                assertSeriesPayload(response, {
                    expectDatos: true,
                    minDatos: 1,
                    startDate: "2015-01-02",
                    endDate: "2015-01-08",
                });
                expect(response.body.bmx.series[0].datos[0]).toEqual(expect.objectContaining({
                    fecha: "02/01/2015",
                    dato: "14.8290",
                }));
                expect(response.body.bmx.series[0].datos.at(-1)).toEqual(expect.objectContaining({
                    fecha: "08/01/2015",
                    dato: "14.6274",
                }));
            });

            it("returns 200 with no datos when the date range is logically inverted", async () => {
                const response = await request(BmxApi.app).get(getRangePath(SERIES_ID, "2015-01-08", "2015-01-01"))
                    .set("Bmx-Token", VALID_TOKEN);

                expect(response.statusCode).toBe(200);
                assertCommonHeaders(response);
                expect(response.body.bmx.series[0].idSerie).toBe(SERIES_ID);
                expect(response.body.bmx.series[0].titulo).toBe(SERIES_TITLE);
                expect(response.body.bmx.series[0]).not.toHaveProperty("datos");
            });

            it("returns 200 with no datos when the date range is outside the available data", async () => {
                const response = await request(BmxApi.app).get(getRangePath(SERIES_ID, "1900-01-01", "1900-01-08"))
                    .set("Bmx-Token", VALID_TOKEN);

                expect(response.statusCode).toBe(200);
                assertCommonHeaders(response);
                expect(response.body.bmx.series[0].idSerie).toBe(SERIES_ID);
                expect(response.body.bmx.series[0].titulo).toBe(SERIES_TITLE);
                expect(response.body.bmx.series[0]).not.toHaveProperty("datos");
            });
        });

        describe("Date format errors", () => {
            it.each([
                ["01-01-2015", "2015-01-08"],
                ["not-a-date", "2015-01-08"],
                ["2015-1-1", "2015-01-08"],
            ])(
                "returns 400 for malformed dates %s and %s",
                async (startDate, endDate) => {
                    const response = await request(BmxApi.app).get(getRangePath(SERIES_ID, startDate, endDate))
                        .set("Bmx-Token", VALID_TOKEN);

                    expect(response.statusCode).toBe(400);
                    assertCommonHeaders(response);
                    assertBadDateFormat(response.body);
                }
            );

            it.each([
                ["2015/01/01", "2015-01-08"],
                ["not-a-date", "2015/01/08"],
                ["2015/1/1", "2015/01/08"],
            ])(
                "returns 404 for malformed dates %s and %s with /",
                async (startDate, endDate) => {
                    const response = await request(BmxApi.app).get(getRangePath(SERIES_ID, startDate, endDate))
                        .set("Bmx-Token", VALID_TOKEN);

                    expect(response.statusCode).toBe(404);
                }
            );
        });
    });
});

