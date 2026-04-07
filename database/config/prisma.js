/**
 * @file database/config/prisma.js
 * @description Prisma client singleton with the trigger extension applied.
 * Replaces the old MariaDB connection pool (db.js).
 */
import { PrismaClient } from "@prisma/client";
import { triggerExtension } from "../../prisma/middleware.js";

const prisma = new PrismaClient().$extends(triggerExtension);

export default prisma;
