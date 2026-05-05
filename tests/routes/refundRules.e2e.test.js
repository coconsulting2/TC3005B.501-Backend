/**
 * @file tests/routes/refundRules.e2e.test.js
 * @description End-to-end M2-006 — cubre /api/policies, /api/employee-categories,
 *   /api/refunds y /api/solicitudes/inbox usando Postgres real (docker-compose.dev).
 *
 * Run:
 *   bun run docker:dev
 *   bun run test:e2e -- tests/routes/refundRules.e2e.test.js
 */
import dotenv from "dotenv";
dotenv.config();

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";

import prisma, { connectPostgres, disconnectPostgres, resetPostgres } from "../../database/config/prisma.js";
import { createTestJWT, LOCALHOST, ROLES } from "../utils/createTestAuthToken.js";

process.env.PRISMA_DISABLE_TRIGGERS = "true";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ??= "dev_jwt_secret_change_me";

const { default: app } = await import("../../app.js");
app.set("trust proxy", "loopback");

// User IDs we will pin per role for the JWT
const USER_ID_BY_ROLE = {
  [ROLES.ADMIN]: 9001,
  [ROLES.SOLICITING]: 9002,
  [ROLES.N1]: 9003,
  [ROLES.N2]: 9004,
};
const ORG_ID = 1n;

const authHeaders = (role) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${createTestJWT(role, { IP: LOCALHOST, user_id: USER_ID_BY_ROLE[role] })}`,
  "x-forwarded-for": LOCALHOST,
});

async function seedCatalogs() {
  await prisma.role.createMany({
    data: [{ roleName: "Solicitante" }, { roleName: "N1" }, { roleName: "N2" }, { roleName: "Administrador" }],
    skipDuplicates: true,
  });
  await prisma.requestStatus.createMany({
    data: [
      { status: "Borrador" }, { status: "Primera Revisión" }, { status: "Segunda Revisión" },
      { status: "Cotización del Viaje" }, { status: "Atención Agencia de Viajes" },
      { status: "Comprobación gastos del viaje" }, { status: "Validación de comprobantes" },
      { status: "Finalizado" }, { status: "Cancelado" }, { status: "Rechazado" },
    ],
    skipDuplicates: true,
  });
  await prisma.receiptType.createMany({
    data: [{ receiptTypeName: "Hospedaje" }, { receiptTypeName: "Comida" }, { receiptTypeName: "Vuelo" }],
    skipDuplicates: true,
  });
}

async function seedUsers() {
  const roleIdByName = Object.fromEntries(
    (await prisma.role.findMany()).map((r) => [r.roleName, r.roleId])
  );
  for (const [roleName, userId] of Object.entries({
    [ROLES.ADMIN]: USER_ID_BY_ROLE[ROLES.ADMIN],
    [ROLES.SOLICITING]: USER_ID_BY_ROLE[ROLES.SOLICITING],
    [ROLES.N1]: USER_ID_BY_ROLE[ROLES.N1],
    [ROLES.N2]: USER_ID_BY_ROLE[ROLES.N2],
  })) {
    await prisma.user.upsert({
      where: { userId },
      update: { orgId: ORG_ID, roleId: roleIdByName[roleName] },
      create: {
        userId, roleId: roleIdByName[roleName], orgId: ORG_ID,
        userName: `e2e_${roleName.replace(/\s/g, "_")}_${userId}`,
        password: "x".repeat(60),
        workstation: "test", email: `e2e_${userId}@test.local`,
      },
    });
  }
}

async function applyPermissionsForRoles() {
  // Permissions referenced by M2-006 routes
  const codes = [
    "policy:read", "policy:manage", "expense:authorize_exception",
    "expense:submit", "travel_request:authorize", "travel_request:view_own", "travel_request:view_any",
  ];
  for (const code of codes) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, resource: code.split(":")[0], action: code.split(":")[1] },
    });
  }
  const all = await prisma.permission.findMany({ where: { code: { in: codes } } });
  const codeToId = Object.fromEntries(all.map((p) => [p.code, p.permissionId]));

  const grants = {
    [ROLES.ADMIN]:      ["policy:read", "policy:manage", "travel_request:view_any", "travel_request:view_own"],
    [ROLES.N1]:         ["policy:read", "expense:authorize_exception", "travel_request:authorize", "travel_request:view_any", "travel_request:view_own"],
    [ROLES.N2]:         ["policy:read", "expense:authorize_exception", "travel_request:authorize", "travel_request:view_any", "travel_request:view_own"],
    [ROLES.SOLICITING]: ["policy:read", "expense:submit", "travel_request:view_own"],
  };

  for (const [roleName, granted] of Object.entries(grants)) {
    const role = await prisma.role.findUnique({ where: { roleName } });
    for (const code of granted) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.roleId, permissionId: codeToId[code] } },
        update: {},
        create: { roleId: role.roleId, permissionId: codeToId[code] },
      });
    }
  }
}

beforeAll(async () => {
  await connectPostgres();
});

beforeEach(async () => {
  await resetPostgres();
  await seedCatalogs();
  await seedUsers();
  await applyPermissionsForRoles();
});

afterAll(async () => {
  await disconnectPostgres();
});

describe("M2-006 E2E: /api/employee-categories", () => {
  it("Admin can create category and list it", async () => {
    const create = await request(app).post("/api/employee-categories")
      .set(authHeaders(ROLES.ADMIN))
      .send({ code: "EJEC", name: "Ejecutivo" });
    expect(create.status).toBe(201);

    const list = await request(app).get("/api/employee-categories")
      .set(authHeaders(ROLES.ADMIN));
    expect(list.status).toBe(200);
    expect(list.body.categories.length).toBeGreaterThan(0);
  });

  it("Solicitante (no policy:manage) gets 403 on POST", async () => {
    const r = await request(app).post("/api/employee-categories")
      .set(authHeaders(ROLES.SOLICITING))
      .send({ code: "EJ2", name: "X" });
    expect(r.status).toBe(403);
  });

  it("Duplicate code returns 409", async () => {
    await request(app).post("/api/employee-categories").set(authHeaders(ROLES.ADMIN)).send({ code: "DUP", name: "A" });
    const dup = await request(app).post("/api/employee-categories").set(authHeaders(ROLES.ADMIN)).send({ code: "DUP", name: "B" });
    expect(dup.status).toBe(409);
  });
});

describe("M2-006 E2E: /api/policies", () => {
  it("create policy with caps and read it back", async () => {
    const create = await request(app).post("/api/policies")
      .set(authHeaders(ROLES.ADMIN))
      .send({
        name: "Base 2026",
        destinationScope: "nacional",
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
        currency: "MXN",
        caps: [
          { receiptTypeId: 1, capAmount: 2500, capUnit: "per_night" },
        ],
      });
    expect(create.status).toBe(201);
    expect(create.body.expenseCaps).toHaveLength(1);

    const get = await request(app).get(`/api/policies/${create.body.policyId}`).set(authHeaders(ROLES.ADMIN));
    expect(get.status).toBe(200);
    expect(get.body.expenseCaps[0].capAmount).toBe("2500");
  });

  it("rejects invalid validFrom > validTo", async () => {
    const r = await request(app).post("/api/policies")
      .set(authHeaders(ROLES.ADMIN))
      .send({ name: "Bad", validFrom: "2026-12-31", validTo: "2026-01-01" });
    expect(r.status).toBe(400);
  });

  it("Solicitante POST receives 403", async () => {
    const r = await request(app).post("/api/policies")
      .set(authHeaders(ROLES.SOLICITING))
      .send({ name: "X", validFrom: "2026-01-01" });
    expect(r.status).toBe(403);
  });

  it("DELETE soft-deletes (active=false)", async () => {
    const create = await request(app).post("/api/policies")
      .set(authHeaders(ROLES.ADMIN))
      .send({ name: "Tmp", validFrom: "2026-01-01" });
    const del = await request(app).delete(`/api/policies/${create.body.policyId}`).set(authHeaders(ROLES.ADMIN));
    expect(del.status).toBe(204);

    const list = await request(app).get("/api/policies?activeOnly=true").set(authHeaders(ROLES.ADMIN));
    expect(list.body.policies.find((p) => p.policyId === create.body.policyId)).toBeUndefined();
  });
});

describe("M2-006 E2E: /api/refunds — time-limit + exceptions flow", () => {
  it("GET time-limit returns defaults when no row", async () => {
    const r = await request(app).get("/api/refunds/time-limit").set(authHeaders(ROLES.ADMIN));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ daysAfterTrip: 14, graceDays: 0, blockOnExpiry: true });
  });

  it("PUT time-limit persists", async () => {
    const put = await request(app).put("/api/refunds/time-limit")
      .set(authHeaders(ROLES.ADMIN))
      .send({ daysAfterTrip: 7, graceDays: 1, blockOnExpiry: false });
    expect(put.status).toBe(200);
    const r = await request(app).get("/api/refunds/time-limit").set(authHeaders(ROLES.ADMIN));
    expect(r.body.daysAfterTrip).toBe(7);
  });

  it("PUT time-limit with daysAfterTrip out of range → 400", async () => {
    const r = await request(app).put("/api/refunds/time-limit")
      .set(authHeaders(ROLES.ADMIN))
      .send({ daysAfterTrip: 0 });
    expect(r.status).toBe(400);
  });

  it("createException + decideException APPROVED flow", async () => {
    // Crear request y receipt
    const req = await prisma.request.create({
      data: {
        userId: USER_ID_BY_ROLE[ROLES.SOLICITING],
        requestStatusId: 6,
        requestedFee: 1000,
        workflowPreSnapshot: { n1UserId: USER_ID_BY_ROLE[ROLES.N1], n2UserId: USER_ID_BY_ROLE[ROLES.N2], levels: [1, 2] },
      },
    });
    const receipt = await prisma.receipt.create({
      data: { requestId: req.requestId, receiptTypeId: 1, amount: 5000, refund: false },
    });

    const create = await request(app).post("/api/refunds/exceptions")
      .set(authHeaders(ROLES.SOLICITING))
      .send({
        requestId: req.requestId,
        receiptId: receipt.receiptId,
        amountClaimed: 5000,
        excessAmount: 2500,
        justification: "Único hotel disponible cerca del congreso esta semana",
      });
    expect(create.status).toBe(201);
    const exceptionId = create.body.exceptionId;

    const decide = await request(app).post(`/api/refunds/exceptions/${exceptionId}/decide`)
      .set(authHeaders(ROLES.N1))
      .send({ decision: "APPROVED", decisionNote: "OK" });
    expect(decide.status).toBe(200);

    const updatedReceipt = await prisma.receipt.findUnique({ where: { receiptId: receipt.receiptId } });
    expect(updatedReceipt.refund).toBe(true);
  });

  it("decideException by non-designated approver → 403", async () => {
    const req = await prisma.request.create({
      data: {
        userId: USER_ID_BY_ROLE[ROLES.SOLICITING],
        requestStatusId: 6,
        workflowPreSnapshot: { n1UserId: USER_ID_BY_ROLE[ROLES.N1], levels: [1] },
      },
    });
    const receipt = await prisma.receipt.create({
      data: { requestId: req.requestId, receiptTypeId: 1, amount: 100, refund: false },
    });
    const create = await request(app).post("/api/refunds/exceptions")
      .set(authHeaders(ROLES.SOLICITING))
      .send({
        requestId: req.requestId, receiptId: receipt.receiptId,
        amountClaimed: 100, excessAmount: 1,
        justification: "1234567890",
      });
    const decide = await request(app).post(`/api/refunds/exceptions/${create.body.exceptionId}/decide`)
      .set(authHeaders(ROLES.N2))
      .send({ decision: "APPROVED" });
    expect(decide.status).toBe(403);
  });

  it("createException with short justification → 400", async () => {
    const r = await request(app).post("/api/refunds/exceptions")
      .set(authHeaders(ROLES.SOLICITING))
      .send({
        requestId: 1, amountClaimed: 100, excessAmount: 1, justification: "no",
      });
    expect(r.status).toBe(400);
  });
});

describe("M2-006 E2E: /api/solicitudes/inbox", () => {
  it("returns requests filtered by N1's status (Primera Revisión)", async () => {
    await prisma.request.create({
      data: {
        userId: USER_ID_BY_ROLE[ROLES.SOLICITING], requestStatusId: 2,
        requestedFee: 1000, notes: "for N1",
      },
    });
    await prisma.request.create({
      data: {
        userId: USER_ID_BY_ROLE[ROLES.SOLICITING], requestStatusId: 3,
        requestedFee: 2000, notes: "for N2",
      },
    });
    const r = await request(app).get("/api/solicitudes/inbox").set(authHeaders(ROLES.N1));
    expect(r.status).toBe(200);
    expect(r.body.requests.every((req) => req.requestStatusId === 2)).toBe(true);
  });

  it("Solicitante (no travel_request:authorize) → 403", async () => {
    const r = await request(app).get("/api/solicitudes/inbox").set(authHeaders(ROLES.SOLICITING));
    expect(r.status).toBe(403);
  });
});
