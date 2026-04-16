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
