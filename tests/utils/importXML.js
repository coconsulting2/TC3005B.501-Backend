/**
 * @file importXML.js
 * @description Utility class for importing and reading XML/text files in test environments.
 * Provides an abstraction layer for file imports using ES modules URL resolution.
 * Useful for loading test fixtures and data files.
 */

import { readFile } from 'fs/promises';

export class Importer {
    constructor(basePath, direname) {
        this.basePath = basePath;
        this.dirname = direname || import.meta.url;
    }

    async import(relativePath, options = null) {
        return String(await readFile(new URL(`./${this.basePath}/${relativePath}`, this.dirname), 'utf-8'));
    }
}
