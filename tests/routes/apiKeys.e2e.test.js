/**
 * @file tests/routes/apiKeys.e2e.test.js
 * @description End-to-end M3-QA2 — cubre el ciclo de vida de API keys montado en
 *   `/api/keys` (admin) y `/api/external/*` (integración X-API-Key):
 *     1. POST /api/keys/generate → 201, captura `id` y `key`.
 *     2. GET  /api/external/accounting/preview con `X-API-Key` → 200.
 *     3. GET  /api/keys/:id/logs → array no vacío (audit del paso 2).
 *     4. DELETE /api/keys/:id/revoke → 200 con `active=false` y `revoked_at`.
 *     5. GET  /api/external/accounting/preview con la misma key → 401.
 *
 * **Aislamiento de datos**: NO usa `resetPostgres()` (TRUNCATE CASCADE).
 *   Solo crea filas nuevas en `api_keys` (auto-increment) e idealmente borra
 *   en `afterAll`. Los datos del seed CocoUAT permanecen intactos.
 *
 * Run:
 *   npx jest --testPathPattern=tests/routes/apiKeys.e2e.test.js --runInBand
 */
import dotenv from "dotenv";
dotenv.config();

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";

import prisma, { connectPostgres, disconnectPostgres } from "../../database/config/prisma.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ??= "dev_jwt_secret_change_me";
process.env.JWT_SKIP_IP_CHECK = "true";
process.env.PRISMA_DISABLE_TRIGGERS = "true";

const { default: app } = await import("../../app.js");
app.set("trust proxy", "loopback");

const ADMIN_DITTA = { username: "admin_ditta", password: "Ditta!Admin#2026" };
const TARGET_ORG_ID = "101"; // CocoUAT
const EXPIRES_AT_FUTURE = "2027-12-31T23:59:59.000Z";

/** @type {string} */ let adminToken;
/** @type {number[]} */ const createdKeyIds = [];

/**
 * Hace login real contra `/api/user/login` y retorna el JWT del seed.
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
  adminToken = await loginAndGetToken(ADMIN_DITTA);
});

afterAll(async () => {
  // Limpieza: borra solo las keys creadas por esta suite (logs caen por onDelete: Cascade).
  for (const id of createdKeyIds) {
    try {
      await prisma.apiKey.delete({ where: { id } });
    } catch (_e) {
      // ignore — puede haber sido borrada por otra corrida.
    }
  }
  await disconnectPostgres();
});

describe("M3-QA2 E2E: API Keys lifecycle (/api/keys + /api/external)", () => {
  it("genera key, consume con X-API-Key, lista logs, revoca y bloquea consumo posterior", async () => {
    // --- Paso 1: generar key con scope accounting:export para CocoUAT (org 101) ---
    const generateRes = await request(app)
      .post("/api/keys/generate")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Organization-Id", TARGET_ORG_ID)
      .set("Content-Type", "application/json")
      .send({
        org_id: TARGET_ORG_ID,
        name: `qa-jest-key-${Date.now()}`,
        scope: { permissions: ["accounting:export"] },
        expires_at: EXPIRES_AT_FUTURE,
      });
    expect(generateRes.status).toBe(201);
    expect(generateRes.body).toHaveProperty("id");
    expect(generateRes.body).toHaveProperty("key");
    expect(generateRes.body.key).toMatch(/^cck_[a-f0-9]+$/);
    expect(generateRes.body.active).toBe(true);
    expect(generateRes.body.scope.permissions).toContain("accounting:export");

    const apiKeyId = Number(generateRes.body.id);
    const apiKeySecret = generateRes.body.key;
    createdKeyIds.push(apiKeyId);

    // --- Paso 2: consumir external preview con X-API-Key (sin Bearer) ---
    const consumeRes = await request(app)
      .get("/api/external/accounting/preview")
      .set("X-API-Key", apiKeySecret);
    expect(consumeRes.status).toBe(200);
    expect(consumeRes.body.ok).toBe(true);
    expect(String(consumeRes.body.org_id)).toBe(TARGET_ORG_ID);

    // --- Paso 3: leer audit log de la key (debe tener >= 1 entrada del consume previo) ---
    const logsRes = await request(app)
      .get(`/api/keys/${apiKeyId}/logs`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Organization-Id", TARGET_ORG_ID);
    expect(logsRes.status).toBe(200);
    expect(Array.isArray(logsRes.body)).toBe(true);
    expect(logsRes.body.length).toBeGreaterThan(0);
    expect(logsRes.body[0]).toHaveProperty("endpoint");
    expect(logsRes.body[0]).toHaveProperty("responseCode");

    // --- Paso 4: revocar key ---
    const revokeRes = await request(app)
      .delete(`/api/keys/${apiKeyId}/revoke`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Organization-Id", TARGET_ORG_ID);
    expect([200, 204]).toContain(revokeRes.status);
    if (revokeRes.status === 200) {
      expect(revokeRes.body.active).toBe(false);
      expect(revokeRes.body).toHaveProperty("revoked_at");
    }

    // --- Paso 5: el siguiente consumo con la misma key debe regresar 401 ---
    const afterRevokeRes = await request(app)
      .get("/api/external/accounting/preview")
      .set("X-API-Key", apiKeySecret);
    expect(afterRevokeRes.status).toBe(401);
  });

  it("lista API keys por organizacion incluye la key generada", async () => {
    // Generamos una nueva key solo para esta aserción independiente.
    const generateRes = await request(app)
      .post("/api/keys/generate")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Organization-Id", TARGET_ORG_ID)
      .set("Content-Type", "application/json")
      .send({
        org_id: TARGET_ORG_ID,
        name: `qa-jest-list-${Date.now()}`,
        scope: { permissions: ["accounting:export"] },
        expires_at: EXPIRES_AT_FUTURE,
      });
    expect(generateRes.status).toBe(201);
    const id = Number(generateRes.body.id);
    createdKeyIds.push(id);

    const listRes = await request(app)
      .get(`/api/keys/org/${TARGET_ORG_ID}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Organization-Id", TARGET_ORG_ID);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    const ids = listRes.body.map((k) => Number(k.id));
    expect(ids).toContain(id);
  });
});
