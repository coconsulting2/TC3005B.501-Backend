/**
 * @file tests/services/BER/server/db.js
 * @description In-memory data store for the Banxico mock server used in BER tests.
 */

/**
 * @typedef {Object} TokensTable
 * @property {number} activeTokens
 * @property {Record<string, boolean>} tokens
 */

/**
 * @typedef {Object} SeriesDatum
 * @property {string} fecha
 * @property {number} timestamp
 * @property {string} dato
 */

/**
 * @typedef {Object} SeriesEntry
 * @property {string} titulo
 * @property {SeriesDatum[]} datos
 */

/**
 * @typedef {Object} SeriesTable
 * @property {string[]} supportedSeries
 * @property {Record<string, SeriesEntry>} series
 */

/**
 * @typedef {Object} QuerySeriesParams
 * @property {string} seriesId
 * @property {string} [startDate]
 * @property {string} [endDate]
 */

/**
 * @typedef {Object} QueryTokenParams
 * @property {string} token
 */

/**
 * @typedef {Object} TokenQueryResult
 * @property {boolean | undefined} valid
 * @property {string} token
 */

import series_data from "./series.json";


class DB {
    /** @type {TokensTable} */
    #tokens;
    /** @type {SeriesTable} */
    #series;

    constructor() {
        this.#tokens = {
            "activeTokens": 1,
            "tokens": {
                "e3980208bf01ec653aba9aee3c2d6f70f6ae8b066d2545e379b9e0ef92e9de25": true,
                "e3980208bf05ec653aba9aee3c2d6f70f6ae8b066d2545e379b9e0ef92e9de25": true
            }
        };

        this.#series = /** @type {SeriesTable} */ (series_data);
    }

    /**
     * Retrieves a series and optionally filters records by inclusive date range.
     *
     * @param {QuerySeriesParams} params
     * @returns {SeriesEntry}
     */
    querySeries({ seriesId, startDate, endDate }) {
        if (!this.#series.supportedSeries.includes(seriesId)) {
            throw new Error(`Series ID '${seriesId}' not found.`);
        }
        const res = this.#series.series[seriesId];
        let datos = res.datos;

        const end = new Date(`${endDate}T00:00:00.0z`).getTime();
        const from = new Date(`${startDate}T00:00:00.0z`).getTime();
        const to = isNaN(end) ? Date.now() : Math.min(end, Date.now());
        if (startDate && endDate) {
            datos = datos.filter((record) => record.timestamp >= from && record.timestamp <= to);
        } else {
            datos = datos.filter((record) => record.timestamp <= to);
        }

        return {
            ...res, datos
        };
    }

    /**
     * Validates a token against the in-memory token table.
     *
     * @param {QueryTokenParams} params
     * @returns {TokenQueryResult}
     */
    queryToken({ token }) {
        return { valid: this.#tokens.tokens[token], token };
    }
}

export { DB };
