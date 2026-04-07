/**
 * @module logger
 * @description Centralized Winston logger for CocoAPI.
 * Writes structured logs to console and to rotating log files.
 * - console: colorized, all levels >= LOG_LEVEL (default "info")
 * - logs/error.log: only error-level entries
 * - logs/combined.log: all levels
 */
import { createLogger, format, transports } from "winston";

const { combine, timestamp, printf, colorize, errors } = format;

const LOG_LEVEL = process.env.LOG_LEVEL || "info";

/**
 * Single-line log format used for file transports.
 * Shows timestamp, level, and message (or stack trace on errors).
 */
const fileFormat = combine(
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) =>
    `${ts} [${level.toUpperCase()}]: ${stack || message}`
  )
);

/**
 * Colorized format for console transport.
 */
const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) =>
    `${ts} [${level}]: ${stack || message}`
  )
);

const logger = createLogger({
  level: LOG_LEVEL,
  transports: [
    new transports.Console({ format: consoleFormat }),
    new transports.File({ filename: "logs/error.log", level: "error", format: fileFormat }),
    new transports.File({ filename: "logs/combined.log", format: fileFormat }),
  ],
  exitOnError: false,
});

export default logger;
