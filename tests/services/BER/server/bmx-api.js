/**
 * @file tests/services/BER/server/bmx-api.js
 * @description Express mock of the Banxico SIE API contract used by BER tests.
 */

import express from "express";
import rateLimit, { MemoryStore } from "express-rate-limit";
import { DB } from "./db.js";


const store1 = new MemoryStore();
const store2 = new MemoryStore();

/**
 * @typedef {Object} TokenPayload
 * @property {string | undefined} token
 */

/**
 * @typedef {Object} InjectFlags
 * @property {string | number | null} flag
 */

const limiterConfig = {
    keyGenerator: (req) => req.get("Bmx-Token") || req.query.token,
    message: (req, res) => {
        const resetTime = req.get("RateLimit-Reset");
        const now = Math.floor(Date.now() / 1000);

        const secondsToReset = resetTime - now;
        const resetDate = (new Date()).toISOString();

        res.set({
            "bmx-timereset": Number(resetTime),
            "bmx-secondstoreset": Number(secondsToReset)
        });

        return {
            "error": {
                "mensaje": "Límite de consultas superado.",
                "detalle": "El límite de consultas ha sido superado. Podrá volver a consultar el servicio a las" +
                    ` ${resetDate} America/Mexico_City`,
                "timeReset": Number(resetTime),
                "secondsToReset": Number(secondsToReset)
            }
        };
    }
};

const historicRateLimit = rateLimit({
    windowMs: 5 * 1000 * 60,
    max: 200,
    ...limiterConfig,
    standardHeaders: true,
    legacyHeaders: false,
    store: store1
});

const historicDayRateLimit = rateLimit({
    windowMs: 1000 * 60 * 60 * 24,
    max: 10_00,
    ...limiterConfig,
    standardHeaders: true,
    legacyHeaders: false,
    store: store2
});

const db = new DB();
const app = express();
app.use(express.json());

let down = false;
let empty = false;
app.use((req, res, next) => {
    if (down) {
        res.status(503).send("Service unavailable");
        return;
    }

    next();
});


/**
 * Validates that optional range parameters follow `yyyy-MM-dd` format.
 *
 * @param {string | undefined} startDate
 * @param {string | undefined} endDate
 * @returns {boolean}
 */
function validDataRange(startDate, endDate) {
    if (!startDate && !endDate) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return false;

    return true;
}

/**
 * Extracts token from query parameter or request header.
 *
 * @param {import("express").Request} req
 * @returns {TokenPayload}
 */
function extractBmxToken(req) {
    const { token } = req.query;
    const header_token = req.get("bmx-token");

    if (token) return { token: token };
    if (header_token) return { token: header_token };

    return { token: undefined };
}

/**
 * Validates Banxico token shape and presence in the mock token table.
 *
 * @param {string | undefined} token
 * @returns {boolean}
 */
function validToken(token) {
    if (!token) return false;
    if (String(token).length !== 64) return false;

    const tokenRecord = db.queryToken({ token });

    if (!tokenRecord) return false;

    return tokenRecord.valid;
}

/**
 * Verifies the expected Banxico series identifier format.
 *
 * @param {string} series
 * @returns {boolean}
 */
function validSeriesId(series) {
    return /^SF\d{5}$/.test(series);
}

/**
 * Handles both current and ranged series endpoints for the mock API.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {void}
 */
function seriesController(req, res) {
    try {
        res.set({
            "access-control-allow-headers": "Bmx-Token, Accept, Accept-Encoding, Content-Type",
            "access-control-allow-methods": "GET",
            "access-control-allow-origin": "*",
            "content-language": "es",
            "content-security-policy": "script-src 'self'",
            "date": (new Date()).toGMTString(),
        });


        const { seriesId, startDate, endDate } = req.params;
        const { token } = extractBmxToken(req);

        if (!seriesId) {
            res
                .status(404)
                .send(
                    "The resource you are looking for has been removed, had its name changed, or is" +
                    " temporarily unavailable.");
            return;
        }

        if (!validDataRange(startDate, endDate)) {
            res
                .status(400)
                .send({
                    "error": {
                        "mensaje": "Formato de fecha incorrecto.",
                        "detalle": "El formato de la fecha enviada es incorrecto. Debe ser yyyy-MM-dd."
                    }
                });
            return;
        }

        if (!validToken(token)) {
            res
                .status(400)
                .send({
                    error: {
                        url: "https://localhost:bmxmokcport/SieAPIRest/service/v1/token",
                        mensaje: "Token inválido",
                        detalle: "El token enviado no es válido, favor de verificar. Para obtener un token consultar la url adjunta."
                    }
                });
            return;
        }

        if (!validSeriesId(seriesId)) {
            res.status(400).send({
                error: {
                    mensaje: "Formato de series incorrecto.",
                    detalle: "Formato de series debe ser SX####[-SX####][,SX####[-SX####]]",
                    test_msg: "Mock server only supports series 'SF43718' MXN | USD"
                }
            });
            return;
        }

        if (seriesId !== "SF43718") {
            res.status(404).send("Mock server only supports series 'SF43718' MXN | USD");
            return;
        }

        let serie;
        try {
            if (startDate && endDate) {
                serie = db.querySeries({ seriesId, startDate, endDate });
            } else {
                serie = db.querySeries({ seriesId });
            }
        } catch (err) {
            console.error(`[ ERROR:BMX:DB ] - Uncatch db error:\n\n\t${err}`);
            res.status(500).send("Unknown error at mock server.");
            return;
        }

        if (empty) {
            res
                .status(200)
                .send({
                    "bmx": {
                        "series": []
                    }
                });
            return;
        }

        res
            .status(200)
            .send({
                "bmx": {
                    "series": [
                        {
                            "idSerie": seriesId,
                            "titulo": serie.titulo,
                            ...(serie.datos.length !== 0 && { "datos": serie.datos })
                        }
                    ]
                }
            });
    } catch (err) {
        console.error(err);
        res.status(501).send({
            error: err
        });
    }
}


app.get("/", (_, res) => {
    res
        .status(200)
        .send(
            "You are reaching the bmx mock api server for automated testing, visit the official cocowiki" +
            " for more information");
});

app.get("/health", (_, res) => {
    res.status(200).send("BMX mock api running OK");
});

app.get("/SieAPIRest/service/v1/token", (_, res) => {
    res.status(401);
});

app.get("/SieAPIRest/service/v1/series/:seriesId/datos",
    historicDayRateLimit,
    historicRateLimit,
    seriesController
);

app.get("/SieAPIRest/service/v1/series/:seriesId/datos/:startDate/:endDate",
    historicDayRateLimit,
    historicRateLimit,
    seriesController
);


app.use((_, res) => {
    res.status(404).send("Route not Found");
});


class BmxApi {
    static #instance = null;
    static FLAGS = { UP: "up", DOWN: "down", EMPTY: "empty", NOT_EMPTY: 658712 };
    static app = app;
    static db = db;
    static store = {
        resetAll: async () => {
            await store1.resetAll();
            await store2.resetAll();
        }
    };
    #server;

    /**
     * @param {number | string} port
     */
    constructor(port) {
        if (BmxApi.#instance) {
            return BmxApi.#instance;
        }

        this.port = port;
        this.#server = undefined;
        BmxApi.#instance = this;
    }

    /**
     * Starts the mock server and returns the base API URL.
     *
     * @returns {Promise<string>}
     */
    async start() {
        if (this.#server) {
            throw new Error(
                "[ ERROR:BMX ] - BMX mock api attempted to be started twice without stopping it."
            );
        }
        this.#server = await app.listen(this.port, () => {
            console.debug("[ DEBUG:BMX ] - BMX mock api server started.");
        });

        return `http://localhost:${this.port}/SieAPIRest/service/v1`;
    }

    /**
     * Updates mock server behavior flags (up/down/empty/not-empty).
     *
     * @param {InjectFlags} [param0={ flag: null }]
     * @returns {{ state: { down: boolean, empty: boolean } }}
     */
    inject({ flag } = {flag: null}) {
        if (flag === BmxApi.FLAGS.DOWN) {
            down = true;
        } else if (flag === BmxApi.FLAGS.UP) {
            down = false;
        } else if (flag === BmxApi.FLAGS.EMPTY) {
            empty = true;
        } else if (flag === BmxApi.FLAGS.NOT_EMPTY) {
            empty = false;
        }

        return {
            state: {
                down, empty
            }
        };
    }

    /**
     * Stops the currently running mock server.
     *
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.#server) {
            throw new Error(
                "[ ERROR:BMX ] - BMX mock api attempted to be stop without starting" +
                "\n\t\t Call {BmxApi instance}.start() before attempting to stop server."
            );
        }

        await this.#server.close();
        this.#server = undefined;
    }

    /**
     * Returns a known-valid token for tests.
     *
     * @returns {string}
     */
    static getToken() {
        return "e3980208bf01ec653aba9aee3c2d6f70f6ae8b066d2545e379b9e0ef92e9de25";
    }

    /**
     * Returns a known-valid token for tests.
     *
     * @returns {string}
     */
    getToken() {
        return BmxApi.getToken();
    }
}

export { BmxApi };
