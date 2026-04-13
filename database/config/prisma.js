/**
 * @file database/config/prisma.js
 * @description Prisma client singleton with the trigger extension applied.
 * Replaces the old MariaDB connection pool (db.js).
 */
import { PrismaClient } from "@prisma/client";
import { triggerExtension } from "../../prisma/middleware.js";

const prisma = new PrismaClient().$extends(triggerExtension);

async function connectPostgres() {
    try {
        await prisma.$connect();
        console.log("Connected to PostgreSQL via Prisma")// eslint-disable-line no-console
    } catch (err) {
        throw new Error(`Failed to connect to PostgreSQL.\n${err.message}`);
    }
}

async function resetPostgres() {
    if (process.env.NODE_ENV !== 'test') throw new Error("Call outside testing environment.");

    const tables = await prisma.$queryRaw`
        SELECT tablename 
        FROM pg_tables
        WHERE schemaname = 'public'
            AND tablename <> '_prisma_migrations'
    `;

    if (!tables.length) return;

    const tableLists = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await prisma.$queryRawUnsafe(
        `TRUNCATE TABLE ${tableLists} RESTART IDENTITY CASCADE`
    );
}

async function disconnectPostgres() {
    if (process.env.NODE_ENV !== "test") {
        console.warn("Call 'disconnectPostgres' was call outside a testing env.");
    }

    await prisma.$disconnect();
    console.log("Disconnected PostgreSQL via Prisma")// eslint-disable-line no-console
}

export default prisma;
export { connectPostgres, disconnectPostgres, resetPostgres };
