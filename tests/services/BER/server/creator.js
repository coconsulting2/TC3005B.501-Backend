/**
 * @file tests/services/BER/server/creator.js
 * @description Utility script that augments BER mock series records with Unix timestamps.
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

import { writeFile, readFile } from "fs/promises";

/**
 * Populates `timestamp` values in `series.json` and writes the result to `series-1.json`.
 *
 * @returns {Promise<void>}
 */
async function main() {
    /** @type {SeriesTable} */
    const data = JSON.parse(await readFile(new URL("./series.json", import.meta.url), "utf-8"));

    for (const record of data.series["SF43718"].datos) {
        const [day, month, year] = record.fecha.split("/").map(Number);
        record.timestamp = new Date(Date.UTC(year, month - 1, day)).getTime();
    }

    await writeFile(new URL("./series-1.json", import.meta.url), JSON.stringify(data, null, 2));
}

main();
