/**
 * @file tests/routes/export.e2e.test.js
 * @description End-to-end M3-QA2 — cubre la exportacion contable `/api/export/contable`:
 *   1. CxP (`eder.cantero`) GET `?format=json` → 200, body con `polizas: []`.
 *   2. CxP GET `?format=xml` → 200, content-type `application/xml` (o `text/xml`).
 *   3. Administrador (`mariano.carretero`) GET sin formato → 403 (gate
 *      `requireAuth(["Cuentas por pagar"])` solo deja pasar el rol exacto).
 *   4. Re-export: CxP GET `?status=Sincronizado&format=json` → 200, devuelve
 *      registros previamente exportados.
 *
 * **Aislamiento de datos**: NO usa `resetPostgres()`. Las peticiones son de solo
 *   lectura excepto la marca `isExported=true` que aplica `accountingExportService`
 *   tras generar polizas — esto solo afecta a Requests Finalizados, no al seed
 *   de usuarios/roles.
 *
 * Run:
 *   npx jest --testPathPattern=tests/routes/export.e2e.test.js --runInBand
 */
import dotenv from "dotenv";
dotenv.config();

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";

import { connectPostgres, disconnectPostgres } from "../../database/config/prisma.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ??= "dev_jwt_secret_change_me";
process.env.JWT_SKIP_IP_CHECK = "true";
process.env.PRISMA_DISABLE_TRIGGERS = "true";

const { default: app } = await import("../../app.js");
app.set("trust proxy", "loopback");

const CXP_USER = { username: "eder.cantero", password: "Fuego2026!" };
const ADMIN_USER = { username: "mariano.carretero", password: "Fuego2026!" };

/** @type {string} */ let cxpToken;
/** @type {string} */ let adminToken;

/**
 * Login real contra `/api/user/login`.
 * @param {{username: string, password: string}} creds
 * @returns {Promise<string>}
 */
async function loginAndGetToken(creds) {
  const res = await request(app)
    .post("/api/user/login")
    .send(creds)
    .set("Content-Type", "application/json");
  if (res.status !== 200 || !res.body.token) {
    throw new Error(`Login failed for ${creds.username}: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

beforeAll(async () => {
  await connectPostgres();
  [cxpToken, adminToken] = await Promise.all([
    loginAndGetToken(CXP_USER),
    loginAndGetToken(ADMIN_USER),
  ]);
});

afterAll(async () => {
  await disconnectPostgres();
});

describe("M3-QA2 E2E: /api/export/contable", () => {
  it("CxP obtiene export JSON con array de polizas", async () => {
    const res = await request(app)
      .get("/api/export/contable")
      .query({ date_from: "2026-01-01", format: "json" })
      .set("Authorization", `Bearer ${cxpToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"] || "").toMatch(/application\/json/);
    expect(res.body).toHaveProperty("polizas");
    expect(Array.isArray(res.body.polizas)).toBe(true);
  });

  it("CxP obtiene export XML con content-type application/xml o text/xml", async () => {
    const res = await request(app)
      .get("/api/export/contable")
      .query({ date_from: "2026-01-01", format: "xml" })
      .set("Authorization", `Bearer ${cxpToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"] || "").toMatch(/(application|text)\/xml/);
    expect(String(res.text).trim()).toMatch(/^(<\?xml|<)/);
  });

  it("Administrador (no CxP) recibe 403 al exportar", async () => {
    const res = await request(app)
      .get("/api/export/contable")
      .query({ date_from: "2026-01-01" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("Re-export con status=Sincronizado devuelve registros previamente exportados", async () => {
    const res = await request(app)
      .get("/api/export/contable")
      .query({ date_from: "2026-01-01", status: "Sincronizado", format: "json" })
      .set("Authorization", `Bearer ${cxpToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("polizas");
    expect(Array.isArray(res.body.polizas)).toBe(true);
  });

  it("Falta date_from devuelve 400", async () => {
    const res = await request(app)
      .get("/api/export/contable")
      .set("Authorization", `Bearer ${cxpToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
