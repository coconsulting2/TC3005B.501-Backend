/**
 * @file database/config/prisma.js
 * @description Prisma client singleton with trigger middleware.
 * Replaces the old MariaDB connection pool (db.js).
 * Pool size is controlled via the connection_limit parameter in DATABASE_URL
 * (e.g. postgresql://user:pass@host/db?connection_limit=10&pool_timeout=10).
 */
import { PrismaClient } from "@prisma/client";
import { registerMiddleware } from "../../prisma/middleware.js";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

registerMiddleware(prisma);

export default prisma;
