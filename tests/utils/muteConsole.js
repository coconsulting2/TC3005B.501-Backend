/**
 * @file muteConsole.js
 * @description Utility function for suppressing console output during test execution.
 * Uses Jest spies to mock console.log calls, useful for keeping test output clean
 * when testing code that produces verbose logging.
 */

import { jest } from "@jest/globals";

export async function mutedConsoleLogs(fn) {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {
    });
    try {
        return await fn();
    } finally {
        logSpy.mockRestore();
    }
}

/**
 * Suppresses `console.warn` and `console.error` for the duration of `fn`
 * (e.g. expected failure paths that still log in production code).
 * @param {() => Promise<unknown>} fn
 * @returns {Promise<unknown>}
 */
export async function mutedConsoleWarnError(fn) {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
        return await fn();
    } finally {
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    }
}
