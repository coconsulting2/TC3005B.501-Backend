/**
 * @file database/config/prisma.js
 * @description Prisma client singleton with trigger middleware.
 * Replaces the old MariaDB connection pool (db.js).
 */
import { PrismaClient } from "@prisma/client";
import { registerMiddleware } from "../../prisma/middleware.js";

const prisma = new PrismaClient();
registerMiddleware(prisma);

export default prisma;
